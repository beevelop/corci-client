/**
 * @name ClientWorker
 * @version 0.1.0
 * @fileoverview the client requests new builds from the server
 */

var libs = require('corci-libs');

var Logger = libs.Logger;
var FileHelper = libs.FileHelper;
var FileStream = libs.FileStream;
var Common = libs.Common;

var P = Common.Promise;
var fs = Common.fsExtra;
var CircularJSON = Common.circularJSON;//@todo: remove
var ioc = Common.socket.client;

var path = require('path');

/**
 * Initialise the ClientWorker
 *
 * @class
 * @param {Object} conf - command line options
 */
function Client(conf) {
    this.conf = conf;
    this.id = this.BRID = Common.getShortID();
    this.location = path.resolve(conf.location || 'output');
    this.built = 0;

    this.socket = this.connect(conf.url);
}

/**
 * Connect to the server (create new socket)
 * and attach Listeners
 */
Client.prototype.connect = function (url) {
    var socket = ioc.connect(url);
    socket.on('connect', this.onConnect.bind(this));
    socket.on('disconnect', this.onDisconnect.bind(this));
    socket.on('error', this.onError.bind(this));
    socket.on('build-success', this.onBuildSuccess.bind(this));
    socket.on('build-failed', this.onBuildFailed.bind(this));

    Logger.extendSocket(socket, socket, 'log', {
        mirror: true
    });

    return socket;
};

/**
 * Handle socket errors
 *
 * @param {Object} [err] - error object or null
 */
Client.prototype.onError = function (err) {
    Logger.error(err);
    process.exit(1);
};

/**
 * Register client, create Build and initialise file uploads
 */
Client.prototype.onConnect = function () {
    Logger.info('Successfully connected! Requesting build on %s', this.conf.platforms.toString());

    Logger.client('Registering this client and sending a new BuildRequest...');
    this.socket.emit('register', this.id, !!this.conf.location);

    this.socket.emit('request', this.BRID, this.conf.platforms);

    this.uploadFiles();
};

/**
 * Upload build files to server and free memory afterwards
 */
Client.prototype.uploadFiles = function () {
    var files = this.parseFiles();

    this.socket.log.client('Starting upload of %d file(s) for BuildRequest #%s', files.length, this.BRID);

    var _this = this;
    var streams = [];
    P.resolve(files).map(function (file) {
        var stream = FileStream.send(_this.socket, 'upload', file.localpath, file.BRID, file.platform);
        streams.push(stream);
    });

    P.all(streams)
        .then(function () {
            _this.socket.emit('uploaded', _this.BRID);
        })
        .catch(function (err) {
            _this.socket.emit('fail-build', _this.BRID); //@todo: disconnect instead
            console.log('Error reading the input files\n{0}'.format(err)); //@todo: replace
        });
};

/**
 * Exits the process when socket disconnects
 */
Client.prototype.onDisconnect = function () {
    Logger.client('Disconnected');
    process.exit();
};

/**
 * Disconnect the client when build fails
 */
Client.prototype.onBuildFailed = function () {
    var client = this;
    if (++client.built >= client.conf.platforms.length) {
        client.disconnect();
    }
};

/**
 * Disconnect the the socket and exit process
 */
Client.prototype.disconnect = function () {
    try {
        Logger.info('Client is disconnecting from the server since the build tasks completed.');
        this.socket.disconnect();
    } catch (e) {
        //@TODO: error-handling
    } finally {
        process.exit(0);
    }
};

/**
 * Save outputfiles and build logs
 *
 * @param {Build} build - the suceeded build
 */
Client.prototype.onBuildSuccess = function (build) {
    var client = this;
    this.succBuild = build;
    if (this.conf.location) {
        //var id = build.masterId || build.id;
        var files = build.outputFiles;
        var locationPath = path.resolve(client.location, build.id);
        this.buildPath = path.resolve(locationPath, 'build.' + build.conf.platform + '.json');

        FileHelper.writeFiles(locationPath, files, 'the cordova build client {0}'.format(build.conf.platform), function (err) {
            if (err) {
                client.log(build, Msg.error, 'error saving build output files on the cordova build server\n{3}', err);
                return client.onBuildFailed();
            }
            FileHelper.cleanLastFolders(client.conf.keep, client.location + "/*", client.saveBuildLog.bind(client));
        });
    } else {
        this.done();
    }
};

/**
 * Write logfiles
 *
 * @param {Object} [err] - error object or null
 */
Client.prototype.saveBuildLog = function (err) {
    if (err) {
        this.log(this.succBuild, Msg.debug, 'Error while cleaning up last {2} folders in CLIENT output folder {3}:\n{4}', this.conf.keep, this.location, err);
    }
    fs.writeFile(this.buildPath, CircularJSON.stringify(this.succBuild, null, 4), this.done.bind(this));
};

/**
 * Free memory and disconnect if all builds are done
 *
 * @param {Object} [err] - error object or null
 */
Client.prototype.done = function (err) {
    if (err) {
        this.log(this.succBuild, Msg.debug, 'Error while saving {2}:\n{3}', this.buildPath, err);
    }
    if (this.succBuild.outputFiles) {
        FileHelper.freeMemFiles(this.succBuild.outputFiles);
    }
    this.log(this.succBuild, Msg.info, 'Build done! It took {2}.', new Date(this.succBuild.conf.started).elapsed());
    if (++this.built >= this.conf.platforms.length) {
        this.disconnect();
    }
};

/**
 * Parse the groupfiles (according to conf.platforms)
 */
Client.prototype.parseFiles = function () {
    var conf = this.conf;
    var platforms = ['file'].concat(conf.platforms);
    var files = [];

    var _this = this;
    platforms.forEach(function (platform) {
        if (platform in conf) {
            if (typeof conf[platform] == 'string'
                || conf[platform] instanceof String) {
                conf[platform] = [conf[platform]];
            }

            conf[platform].forEach(function (file) {
                var f = file.split(/;|,/);
                f.forEach(function (localpath) {
                    try {
                        files.push({
                            BRID: _this.BRID,
                            localpath: path.resolve(localpath),
                            platform: platform
                        });
                    } catch (e) {
                        Logger.error('Error parsing the files');
                        throw e;
                    }
                });
            });
        }
    });
    return files;
};

module.exports = Client;