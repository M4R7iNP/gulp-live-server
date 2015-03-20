'use strict';
/**
 * Created by gimm on 3/13/2015.
 */

var util = require('util'),
    path = require('path'),
    assert = require('assert'),
    spawn = require('child_process').spawn,
    merge = require('deepmerge'),
    tinylr = require('tiny-lr'),
    es = require('event-stream'),
    Q = require('q'),
    chalk = require('chalk'),
    debug = require('debug')('gulp-live-server');

var lr = undefined; // tiny-lr server
function noop(str) { return str; };

var defaults = {
    options: {
        cwd: undefined,
    },
    livereload: {
        port: 35729
    }
};

defaults.options.env = process.env;
defaults.options.env.server_ENV = 'development';

/**
 * set config data for the new server child process
 * @type {Function}
 */
var Gls = function(args, options, livereload){
    this.config = {};
    this.config.args = args;

    //deal with options
    this.config.options = merge(defaults.options, options || {});

    //deal with livereload
    if (livereload)
        this.config.livereload = (typeof livereload === 'object' ? livereload : {port: livereload});
    else
        this.config.livereload = (livereload === false ? false : defaults.livereload);

    this.info = this.config.options.noColor !== true ? chalk.gray : noop;
    this.error = this.config.options.noColor !== true ? chalk.bold.red : noop;
    this.debug = debug;

	//TODO: this is a quick fix
	//gulp.watch([<files>], server.notify) - notify's this is undefined
	this.notify = this.notify.bind(this);
	this.start = this.start.bind(this);
	this.stop = this.stop.bind(this);
};

module.exports = Gls;

Gls.prototype.processExit = function (code, sig) {
    this.debug(this.info('Main process exited with [code => %s | sig => %s]'), code, sig);
    this.server && this.server.kill();
};

Gls.prototype.serverExit = function (code, sig) {
    this.debug(this.info('server process exited with [code => %s | sig => %s]'), code, sig);
    if (sig !== 'SIGKILL')
        process.exit(0);
};

Gls.prototype.lrServerReady = function () {
    console.log(this.info('livereload[tiny-lr] listening on %s ...'), this.config.livereload.port);
};

Gls.prototype.serverLog = function (data) {
    console.log(this.info(data.trim()));
};

Gls.prototype.serverError = function (data) {
    console.log(this.error(data.trim()));
};

/**
 * default server script, the static server
 */
var staticScriptPath = path.join(__dirname, 'scripts/static.js');

/**
 * create a server child process with the script file
 */
Gls.new = function (script) {
    if(!script){
        return console.log(this.error('script file not specified.'));
    }
    return new Gls([script]);
};

/**
 * create a server child process with the static server script
 */
Gls.static = function (folder, port) {
    folder = folder || process.cwd();
    console.log(folder, util.isArray(folder));
    util.isArray(folder) && (folder = folder.join(','));
    port = port || 3000;
    return new Gls([staticScriptPath, folder, port]);
};

/**
 * start/restart the server
 */
Gls.prototype.start = function () {
    var self = this;
    if (this.server) { // server already running
        this.debug(this.info('kill server'));
        this.server.kill('SIGKILL');
        //server.removeListener('exit', callback.serverExit);
        this.server = undefined;
    } else {
        if(this.config.livereload){
            lr = tinylr(this.config.livereload);
            lr.listen(this.config.livereload.port, this.lrServerReady);
        }
    }
    this.server = spawn('node', this.config.args, this.config.options);
    this.server.stdout.setEncoding('utf8');
    this.server.stderr.setEncoding('utf8');

    this.server.stdout.on('data', function(code, sig){
        self.serverLog(code, sig);
        deferred.resolve(code);
    });
    this.server.stderr.on('data', this.serverError.bind(this));
    this.server.once('exit', this.serverExit.bind(this));

    process.listeners('exit') || process.once('exit', this.processExit.bind(this));

    var deferred = Q.defer();
    return deferred.promise;
};

/**
 * stop the server
 */
Gls.prototype.stop = function () {
    var deferred = Q.defer();
    if (this.server) {
        this.server.once('exit', function (code) {
            deferred.resolve(code);
        });

        this.debug(this.info('kill server'));
        //use SIGHUP instead of SIGKILL, see issue #34
        this.server.kill('SIGKILL');
        //server.removeListener('exit', callback.serverExit);
        this.server = undefined;
    }else{
        deferred.resolve(0);
    }
    if(lr){
        this.debug(this.info('close livereload server'));
        lr.close();
        //TODO how to stop tiny-lr from hanging the terminal
        lr = undefined;
    }

    return deferred.promise;
};

/**
 * tell livereload.js to reload the changed resource(s)
 */
Gls.prototype.notify = function (event) {
	var self = this;

	if (this.config.livereload === false)
		return;

    if(event && event.path){
        var filepath = path.relative(__dirname, event.path);
        this.debug(this.info('file(s) changed: %s'), event.path);
        lr.changed({body: {files: [filepath]}});
    }

    return es.map(function(file, done) {
        var filepath = path.relative(__dirname, file.path);
        self.debug(self.info('file(s) changed: %s'), filepath);
        lr.changed({body: {files: [filepath]}});
        done(null, file);
    });
};
