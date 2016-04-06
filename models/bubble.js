// bubble.js
// Bubble model logic.

var neo4j = require('neo4j');
var errors = require('./errors');

var db = new neo4j.GraphDatabase({
    // Support specifying database info via environment variables,
    // but assume Neo4j installation defaults.
    url: process.env['NEO4J_URL'] || process.env['GRAPHENEDB_URL'] ||
        'http://neo4j:gh0sthack@localhost:7474',
    auth: process.env['NEO4J_AUTH'],
});

// Private constructor:

var Bubble = module.exports = function Bubble(_node) {
    // All we'll really store is the node; the rest of our properties will be
    // derivable or just pass-through properties (see below).
    this._node = _node;
}

// Public constants:

Bubble.VALIDATION_INFO = {
    'title': {
        required: true,
        minLength: 2,
        maxLength: 55,
        pattern: /^[A-Za-z0-9_]+$/,
        message: '2-55 characters; letters, numbers, and underscores only.'
    },
};

// Public instance properties:

// The bubbles's title, e.g. 'New_title'.
Object.defineProperty(Bubble.prototype, 'title', {
    get: function () { return this._node.properties['title']; }
});

// Private helpers:

// Takes the given caller-provided properties, selects only known ones,
// validates them, and returns the known subset.
// By default, only validates properties that are present.
// (This allows `Bubble.prototype.patch` to not require any.)
// You can pass `true` for `required` to validate that all required properties
// are present too. (Useful for `Bubble.create`.)
function validate(props, required) {
    var safeProps = {};

    for (var prop in Bubble.VALIDATION_INFO) {
        var val = props[prop];
        validateProp(prop, val, required);
        safeProps[prop] = val;
    }

    return safeProps;
}

// Validates the given property based on the validation info above.
// By default, ignores null/undefined/empty values, but you can pass `true` for
// the `required` param to enforce that any required properties are present.
function validateProp(prop, val, required) {
    var info = Bubble.VALIDATION_INFO[prop];
    var message = info.message;

    if (!val) {
        if (info.required && required) {
            throw new errors.ValidationError(
                'Missing ' + prop + ' (required).');
        } else {
            return;
        }
    }

    if (info.minLength && val.length < info.minLength) {
        throw new errors.ValidationError(
            'Invalid ' + prop + ' (too short). Requirements: ' + message);
    }

    if (info.maxLength && val.length > info.maxLength) {
        throw new errors.ValidationError(
            'Invalid ' + prop + ' (too long). Requirements: ' + message);
    }

    if (info.pattern && !info.pattern.test(val)) {
        throw new errors.ValidationError(
            'Invalid ' + prop + ' (format). Requirements: ' + message);
    }
}

function isConstraintViolation(err) {
    return err instanceof neo4j.ClientError &&
        err.neo4j.code === 'Neo.ClientError.Schema.ConstraintViolation';
}

// Public instance methods:

// Atomically updates this bubble, both locally and remotely in the db, with the
// given property updates.
Bubble.prototype.patch = function (props, callback) {
    var safeProps = validate(props);

    var query = [
        'MATCH (bubble:Bubble {title: {title}})',
        'SET bubble += {props}',
        'RETURN bubble',
    ].join('\n');

    var params = {
        title: this.title,
        props: safeProps,
    };

    var self = this;

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            // TODO: This assumes title is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the title is taken or not.
            err = new errors.ValidationError(
                'The title ‘' + props.title + '’ is taken.');
        }
        if (err) return callback(err);

        if (!results.length) {
            err = new Error('Bubble has been deleted! Title: ' + self.title);
            return callback(err);
        }

        // Update our node with this updated+latest data from the server:
        self._node = results[0]['bubble'];

        callback(null);
    });
};

Bubble.prototype.del = function (callback) {
    // Use a Cypher query to delete both this bubble and his/her following
    // relationships in one query and one network request:
    // (Note that this'll still fail if there are any relationships attached
    // of any other types, which is good because we don't expect any.)
    var query = [
        'MATCH (bubble:Bubble {title: {title}})',
        'OPTIONAL MATCH (bubble) -[rel:related]- (other)',
        'DELETE bubble, rel',
    ].join('\n')

    var params = {
        title: this.title,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Bubble.prototype.relate = function (other, callback) {
    var query = [
        'MATCH (bubble:Bubble {title: {thisTitle}})',
        'MATCH (other:Bubble {title: {otherTitle}})',
        'MERGE (bubble) -[rel:related]-> (other)',
    ].join('\n')

    var params = {
        thisTitle: this.title,
        otherTitle: other.title,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Bubble.prototype.unfollow = function (other, callback) {
    var query = [
        'MATCH (bubble:Bubble {title: {thisTitle}})',
        'MATCH (other:Bubble {title: {otherTitle}})',
        'MATCH (bubble) -[rel:related]-> (other)',
        'DELETE rel',
    ].join('\n')

    var params = {
        thisTitle: this.title,
        otherTitle: other.title,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

// Calls callback w/ (err, following, others), where following is an array of
// bubbles this bubble follows, and others is all other bubbles minus him/herself.
Bubble.prototype.getRelatedToAndOthers = function (callback) {
    // Query all bubbles and whether we follow each one or not:
    var query = [
        'MATCH (bubble:Bubble {title: {thisTitle}})',
        'MATCH (other:Bubble)',
        'OPTIONAL MATCH (bubble) -[rel:related]-> (other)',
        'RETURN other, COUNT(rel)', // COUNT(rel) is a hack for 1 or 0
    ].join('\n')

    var params = {
        thisTitle: this.title,
    };

    var bubble = this;
    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) return callback(err);

        var relatedTo = [];
        var others = [];

        for (var i = 0; i < results.length; i++) {
            var other = new Bubble(results[i]['other']);
            var related = results[i]['COUNT(rel)'];

            if (bubble.title === other.title) {
                continue;
            } else if (related) {
                relatedTo.push(other);
            } else {
                others.push(other);
            }
        }

        callback(null, relatedTo, others);
    });
};

// Static methods:

Bubble.get = function (title, callback) {
    var query = [
        'MATCH (bubble:Bubble {title: {title}})',
        'RETURN bubble',
    ].join('\n')

    var params = {
        title: title,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) return callback(err);
        if (!results.length) {
            err = new Error('No such bubble with title: ' + title);
            return callback(err);
        }
        var bubble = new Bubble(results[0]['bubble']);
        callback(null, bubble);
    });
};

Bubble.getAll = function (callback) {
    var query = [
        'MATCH (bubble:Bubble)',
        'RETURN bubble',
    ].join('\n');

    db.cypher({
        query: query,
    }, function (err, results) {
        if (err) return callback(err);
        var bubbles = results.map(function (result) {
            return new Bubble(result['bubble']);
        });
        callback(null, bubbles);
    });
};

// Creates the bubble and persists (saves) it to the db, incl. indexing it:
Bubble.create = function (props, callback) {
    var query = [
        'CREATE (bubble:Bubble {props})',
        'RETURN bubble',
    ].join('\n');

    var params = {
        props: validate(props)
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            // TODO: This assumes title is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the title is taken or not.
            err = new errors.ValidationError(
                'The title ‘' + props.title + '’ is taken.');
        }
        if (err) return callback(err);
        var bubble = new Bubble(results[0]['bubble']);
        callback(null, bubble);
    });
};

// Static initialization:

// Register our unique title constraint.
// TODO: This is done async'ly (fire and forget) here for simplicity,
// but this would be better as a formal schema migration script or similar.
db.createConstraint({
    label: 'Bubble',
    property: 'title',
}, function (err, constraint) {
    if (err) throw err;     // Failing fast for now, by crash the application.
    if (constraint) {
        console.log('(Registered unique titles constraint.)');
    } else {
        // Constraint already present; no need to log anything.
    }
})
