
# Bubbles Neo

A demo is running on Heroku at **<https://bubbles-test.herokuapp.com/>**.

The app is a proof of concept collective intelligence platform: it lets you add, remove, follow,
and unfollow users. Create bubbles and relate them to each other.
It's basic, and the UI is crappy, but hey!


## Installation

```
npm install
```

You'll also need a local Neo4j 2.x instance.


## Usage

Set local variable NEO4J_URL=http://neo4j:pass@localhost:7474
Start your local Neo4j instance (e.g. `neo4j start`), then:

```
npm start
```

The app will now be accessible at
[http://localhost:3000/](http://localhost:3000/).

To run the tests:

```
npm test
```



