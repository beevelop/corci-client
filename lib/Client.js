/**
 * @name ClientWorker
 * @version 0.1.0
 * @fileoverview the client requests new builds from the server
 */

var libs = require('corci-libs');

var Logger = libs.Logger;
var FileStream = libs.FileStream;
var Common = libs.Common;

var P = Common.Promise;
var ioc = Common.socket.client;
var ios = Common.socket.stream;

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
    this._location = path.resolve(conf.location || 'output');

    this.socket = this.connect(conf.url);
}

Client.prototype.getLocation = function () {
    return this._location;
};

/**
 * Connect to the server (create new socket)
 * and attach Listeners
 */
Client.prototype.connect = function (url) {
    var socket = ioc.connect(url);
    socket.on('connect', this.onConnect.bind(this));

    ios(socket).on('serve', this.onServe.bind(this));
    socket.on('conclude', this.onConclude.bind(this));
    socket.on('fail', this.onFail.bind(this));

    socket.on('disconnect', this.onDisconnect.bind(this));
    socket.on('error', this.onError.bind(this));

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

Client.prototype.onFail = function () {
    Logger.error('BuildRequest failed'); //@todo: tell me why??? :'(
    this.disconnect();
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

Client.prototype.onServe = function (stream, meta, BRID) {
    var localpath = path.resolve(this.getLocation(), meta.basename);
    FileStream.save(stream, localpath)
        .bind(this)
        .then(function () {
            this.socket.log.client('Successfully received %s', meta.basename);
        })
        .catch(function (err) {
            this.socket.log.warn('The file %s could not be saved on the client', meta.basename, err);
        });
};

Client.prototype.onConclude = function (BRID) {
    Logger.client('BuildRequest successfully concluded. Bye');
    this.disconnect();
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
            if (typeof conf[platform] == 'string' ||
                conf[platform] instanceof String) {
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