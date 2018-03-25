# Workers

The `qualia:workers` package provides an easy way to parallelize code across multiple processes and fibers on the server. It's as easy as:

```javascript
import Workers from 'meteor/qualia:workers';

let jobs = Workers.map([1, 2, 3], x => x*x);
console.log(Workers.waitAll(jobs));
// => [1, 4, 9]
```

## Installation

```sh
$ meteor add qualia:workers
```

## Usage

Using `qualia:workers` is very simple. The usage shown in the introduction is really all there is to it. However, there are two *very important* things to keep in mind:

1. Workers run in their own processes, which means that there is no shared global state between them. It is a distinct instance of your application.


2. The function passed to `Workers.map` is stringified before being sent to a worker process. This means that it does not have access to the local scope in which it is declared (aka the closure is lost). So the following code would throw an error:
```javascript
let hello = 'hello';
Workers.map(['yo', 'sup', 'hello'], greeting => {
  return hello === greeting;
});
```
This fails because the variable `hello` was declared outside of the function passed to `Workers.map`.
