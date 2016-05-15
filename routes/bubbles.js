// bubble.js
// Routes to CRUD bubbles.

var URL = require('url');

var errors = require('../models/errors');
var Bubble = require('../models/bubble');

function getBubbleURL(bubble) {
    return '/bubbles/' + encodeURIComponent(bubble.title);
}

/**
 * GET /bubbles
 */
exports.list = function (req, res, next) {
    Bubble.getAll(function (err, bubbles) {
        if (err) return next(err);
        // Here we returning bubbles as json result
        res.json(bubbles.map(function(bubble) {
            return {
                id: bubble._node._id,
                title: bubble._node.properties.title,
                text: ''
            };
        }));
    });
};

/**
 * POST /bubbles {title, ...}
 */
exports.create = function (req, res, next) {
    Bubble.create({
        title: req.body.title
    }, function (err, bubble) {
        if (err) {
            if (err instanceof errors.ValidationError) {
                // Return to the create form and show the error message.
                // TODO: Assuming username is the issue; hardcoding for that
                // being the only input right now.
                // TODO: It'd be better to use a cookie to "remember" this info,
                // e.g. using a flash session.
                return res.redirect(URL.format({
                    pathname: '/bubbles',
                    query: {
                        title: req.body.title,
                        error: err.message,
                    },
                }));
            } else {
                return next(err);
            }
        }
        res.redirect(getBubbleURL(bubble));
    });
};

/**
 * GET /bubbles/:title
 */
exports.show = function (req, res, next) {
    Bubble.get(req.params.title, function (err, bubble) {
        // TODO: Gracefully "no such user" error. E.g. 404 page.
        if (err) return next(err);
        // TODO: Also fetch and show followers? (Not just follow*ing*.)
        bubble.getRelatedToAndOthers(function (err, relatedTo, others) {
            if (err) return next(err);
            res.render('bubble', {
                Bubble: Bubble,
                bubble: bubble,
                relatedTo: relatedTo,
                others: others,
                title: req.query.title,   // Support pre-filling edit form
                error: req.query.error,     // Errors editing; see edit route
            });
        });
    });
};

/**
 * POST /bubbles/:title {title, ...}
 */
exports.edit = function (req, res, next) {
    Bubble.get(req.params.title, function (err, bubble) {
        // TODO: Gracefully "no such user" error. E.g. 404 page.
        if (err) return next(err);
        bubble.patch(req.body, function (err) {
            if (err) {
                if (err instanceof errors.ValidationError) {
                    // Return to the edit form and show the error message.
                    // TODO: Assuming username is the issue; hardcoding for that
                    // being the only input right now.
                    // TODO: It'd be better to use a cookie to "remember" this
                    // info, e.g. using a flash session.
                    return res.redirect(URL.format({
                        pathname: getBubbleURL(bubble),
                        query: {
                            title: req.body.title,
                            error: err.message,
                        },
                    }));
                } else {
                    return next(err);
                }
            }
            res.redirect(getBubbleURL(bubble));
        });
    });
};

/**
 * DELETE /bubbles/:title
 */
exports.del = function (req, res, next) {
    Bubble.get(req.params.title, function (err, bubble) {
        // TODO: Gracefully handle "no such user" error somehow.
        // E.g. redirect back to /users with an info message?
        if (err) return next(err);
        bubble.del(function (err) {
            if (err) return next(err);
            res.redirect('/bubbles');
        });
    });
};

/**
 * POST /bubbles/:title/relate {otherTitle}
 */
exports.relate = function (req, res, next) {
    Bubble.get(req.params.title, function (err, bubble) {
        // TODO: Gracefully handle "no such user" error somehow.
        // This is the source user, so e.g. 404 page?
        if (err) return next(err);
        Bubble.get(req.body.otherTitle, function (err, other) {
            // TODO: Gracefully handle "no such user" error somehow.
            // This is the target user, so redirect back to the source user w/
            // an info message?
            if (err) return next(err);
            bubble.relate(other, function (err) {
                if (err) return next(err);
                res.redirect(getBubbleURL(bubble));
            });
        });
    });
};

/**
 * POST /bubbles/:title/unrelate {otherTitle}
 */
exports.unrelate = function (req, res, next) {
    Bubble.get(req.params.title, function (err, bubble) {
        // TODO: Gracefully handle "no such user" error somehow.
        // This is the source user, so e.g. 404 page?
        if (err) return next(err);
        Bubble.get(req.body.otherTitle, function (err, other) {
            // TODO: Gracefully handle "no such user" error somehow.
            // This is the target user, so redirect back to the source user w/
            // an info message?
            if (err) return next(err);
            bubble.unrelate(other, function (err) {
                if (err) return next(err);
                res.redirect(getBubbleURL(bubble));
            });
        });
    });
};
