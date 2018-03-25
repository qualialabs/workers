import Workers from 'meteor/qualia:workers';
import { EJSON } from 'meteor/ejson';

let compareMaps = (f, range=_.range(250)) => {
  let jobs    = Workers.map(range, f),
      results = Workers.waitAll(jobs)
  ;
  return EJSON.equals(results, range.map(f));
};

Tinytest.add('workers - map range', test => {
  let f = x => x*x;
  test.isTrue(compareMaps(f));
});

Tinytest.add('workers - map with core imports', test => {
  let f = () => {
        import os from 'os';
        return os.arch();
      }
  ;
  test.isTrue(compareMaps(f));
});

Tinytest.add('workers - map with meteor imports', test => {
  let f = () => {
        import { EJSON } from 'meteor/ejson';
        return EJSON.stringify([1, 2, 3]);
      }
  ;
  test.isTrue(compareMaps(f));
});

Tinytest.add('workers - map with underscore', test => {
  let f = () => {
        import _ from 'underscore';
        return _.map([1, 2, 3], x => x + 1);
      }
  ;
  test.isTrue(compareMaps(f));
});

Tinytest.add('workers - map with complicated job data', test => {
  let f = people => {
        return Object.values(people).join(', ');
      }
  ;
  test.isTrue(compareMaps(f), [
    { name: 'lucas'  },
    { name: 'joel'   },
    { name: 'nate'   },
    { name: 'hunter' },
  ]);
});

Tinytest.add('workers - count processes', test => {
  let f = () => {
        import { Random } from 'meteor/random';
        global.__workerID = global.__workerID || Random.id();
        return global.__workerID;
      },
      jobs = Workers.map(_.range(1000), f),
      ids = _.uniq(Workers.waitAll(jobs))
  ;
  test.equal(Workers.poolSize, ids.length);
});
