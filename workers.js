import Cluster from 'cluster';
import vm from 'vm';

let Workers = {

  Jobs: new Mongo.Collection('workers.jobs'),

  initialize() {
    global.__Workers = Workers;
    this.module = module;

    if (this.isMaster) {
      this.initMaster();
    }
    else if (this.isWorker) {
      this.initWorker();
    }
  },

  ////////////////////
  //     Master     //
  ////////////////////

  isMaster: Cluster.isMaster,
  poolSize: require('os').cpus().length,
  workers: {},
  promises: {},
  jobCount: 0,
  pollingInterval: 100,

  initMaster() {
    this.Jobs.remove({});
    this.watchCompletedJobs();
    this.watchExitedWorkers();
  },

  watchCompletedJobs() {
    this.Jobs.find({status: 'completed'}).observe({
      added: job => {
        if (!this.promises[job._id])
          return;

        this.jobCount -= 1;
        this.Jobs.remove(job._id);
        this.promises[job._id](job.result);
        delete this.promises[job._id];
      },
    });
  },

  watchExitedWorkers() {
    Cluster.on('exit', (worker, code, signal) => {
      if (worker.exitedAfterDisconnect) {
        console.log(`\x1b[36mWorker ${worker.id}\x1b[0m timed out`);
      }
      else {
        console.log(`\x1b[36mWorker ${worker.id}\x1b[0m exited with \x1b[${code ? '31' : '32'}mcode ${code}\x1b[0m`);
      }

      delete this.workers[worker.id];
    });
  },

  spawn() {
    let worker = Cluster.fork({
      PORT: 0,
      METEOR_SHELL_DIR: '',
      KADIRA_OPTIONS_HOSTNAME: '',
      KADIRA_APP_ID: '',
      KADIRA_APP_SECRET: '',
      BABEL_CACHE_DIR: `/tmp/meteor-workers/${Random.id()}/.babel-cache`,
    });
    this.workers[worker.id] = worker;
    return worker;
  },

  run(f, params={}) {
    this.jobCount += 1;

    // If all the workers are active, and the number of workers
    // is less than poolSize, spawn a new worker.
    this.maybeSpawnWorker();

    return new Promise(resolve => {
      let id = this.Jobs.insert({
        status: 'queued',
        code: _.isString(f) ? f : f.toString(),
        params: EJSON.stringify(params),
      });
      this.promises[id] = resolve;
    });
  },

  map(jobs, f, chunkSize=5) {
    let code = f.toString(),
        chunks = this.chunk(jobs, chunkSize);

    let promises = chunks.map(chunk => {
      return this.run(({chunk, code}) => {
        let Workers = global.__Workers;
        let f = Workers.parseCode(code);
        return Workers.mapFibers(chunk, f);
      }, {chunk, code});
    });

    return _.flatten(Promise.awaitAll(promises), true);
  },

  mapFibers(jobs, f) {
    let promises = jobs.map(job => {
      return Promise.asyncApply(f, this, [job], jobs.length === 1);
    });
    return Promise.awaitAll(promises);
  },

  maybeSpawnWorker() {
    let numWorkers = _.size(this.workers);
    if (numWorkers < this.jobCount && numWorkers < this.poolSize)
      this.spawn();
  },

  wait(job) {
    return Promise.await(job);
  },

  waitAll(jobs) {
    return Promise.awaitAll(jobs);
  },

  ////////////////////
  //     Worker     //
  ////////////////////

  isWorker: Cluster.isWorker,
  workerTimeout: 60000,
  lastRunJob: undefined,

  initWorker() {
    console.log(`Starting \x1b[36mworker ${Cluster.worker.id}\x1b[0m.`);
    this.lastRunJob = new Date();
    this.watchJobs();
  },

  watchJobs() {

    // If there haven't been any jobs for workerTimeout milliseconds, exit
    if (this.lastRunJob && new Date() - this.lastRunJob >= this.workerTimeout) {
      Cluster.worker.kill();
    }

    // Pop a job off the queue
    let job;
    while (true) {
      job = this.Jobs.findOne({status: 'queued'});

      if (!job)
        break;

      // Claim job and avoid race conditions
      let success = this.Jobs.update({
        _id: job._id,
        status: 'queued'
      }, {
        $set: {
          status: 'started',
        },
      });

      if (success)
        break;
    }

    if (job) {
      this.doJob(job);
    }

    if (this.Jobs.find({status: 'queued'}).count() > 0)
      this.watchJobs();
    else
      Meteor.setTimeout(() => this.watchJobs(), this.pollingInterval);
  },

  doJob(job) {

    // Run job
    let f = this.parseCode(job.code),
        result = f.call(global, EJSON.parse(job.params));

    // Mark job as completed
    this.Jobs.update(job._id, {
      $set: {
        status: 'completed',
        result,
      }
    });

    // Log work completed
    let numJobs = this.Jobs.find({status: {$in: ['started', 'queued']}}).count();
    console.log(`\x1b[36mWorker ${Cluster.worker.id}\x1b[0m has finished job ${job._id}. ${numJobs} jobs remaining.`);

    this.lastRunJob = new Date();
  },

  parseCode(rawCode) {
    let compiled = Package.ecmascript.ECMAScript.compileForShell(`(${rawCode})`),
        code =     code = `var module = global.__Workers.module; module.importSync = module.importSync || module.import; var _module = module; var require = module.require; \n\n${compiled}`;
        script = new vm.Script(code);
    return script.runInThisContext();
  },

  chunk(list, chunkSize) {
    let chunks = [];
    for (let i=0; i < list.length; i += chunkSize) {
      chunks.push(list.slice(i, i + chunkSize));
    }
    return chunks;
  },

};

if (process.env.METEOR_WORKERS_MANUAL_INIT !== 'true') {
  Meteor.startup(() => Workers.initialize());
}

export default Workers;
