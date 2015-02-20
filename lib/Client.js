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
    this.BRID = Common.getShortID();
    this._location = path.resolve(conf.location || 'output');
    this.files = this.parseFiles();

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

    // Request
    socket.on('connect', this.onConnect.bind(this));
    socket.on('accept', this.onAccept.bind(this));

    // Response
    socket.on('conclude', this.onConclude.bind(this));
    ios(socket).on('serve', this.onServe.bind(this)); // wrapped with 'ios' because stream
    socket.on('fail', this.onFail.bind(this));

    // Error-Handling (Socket)
    socket.on('disconnect', this.onDisconnect.bind(this));
    socket.on('error', this.onError.bind(this));

    Logger.extendSocket(socket, socket, 'log', {
        mirror: true
    });

    return socket;
};

Client.prototype.wantSave = function () {
    return !!this.conf.location;
};

Client.prototype.onConnect = function () {
    Logger.info('Successfully connected! Requesting build on %s', this.conf.platforms.toString());
    this.socket.emit('request', this.BRID, this.conf.platforms, this.files.length);
};


/**
 * Upload build files to server
 */
Client.prototype.onAccept = function (BRID) {
    var files = this.files;

    this.socket.log.client('Starting upload of %d file(s) for BuildRequest #%s', files.length, BRID);

    var _this = this;
    var streams = [];
    P.resolve(files).map(function (file) {
        var stream = FileStream.send(_this.socket, 'upload', file.localpath, file.BRID, file.platform);
        streams.push(stream);
    });

    P.all(streams)
        .catch(function (err) {
            _this.socket.emit('fail-build', _this.BRID); //@todo: disconnect instead
            console.log('Error reading the input files\n{0}'.format(err)); //@todo: replace
        });
};

Client.prototype.onConclude = function (BRID, filecount) {
    this.filecount = filecount;
    Logger.client('Received BuildRequestConclusion for #%s - expecting %d artifact(s)', BRID, filecount);
    if (this.wantSave() && filecount > 0) {
        this.socket.emit('accept', BRID);
    } else {
        this.disconnect();
    }
};

Client.prototype.onServe = function (stream, meta, BRID) {
    var localpath = path.resolve(this.getLocation(), meta.basename);
    var _this = this;
    FileStream.save(stream, localpath)
        .bind(this)
        .then(function () {
            _this.socket.log.client('Successfully received %s', meta.basename);
        })
        .catch(function (err) {
            _this.socket.log.warn('The file %s could not be saved on the client', meta.basename, err);
        })
        .then(function () {
            _this.filecount = _this.filecount - 1;
            if (_this.filecount === 0) {
                _this.disconnect();
            }
        });
};

Client.prototype.onFail = function () {
    Logger.error('BuildRequest failed'); //@todo: tell me why??? :'(
    this.disconnect();
};

/**
 * Exits the process when socket disconnects
 */
Client.prototype.onDisconnect = function () {
    Logger.client('Disconnected');
    process.exit();
};

/**
 * Handle socket errors
 */
Client.prototype.onError = function (err) {
    Logger.error(err);
    process.exit(1);
};

/**
 * Disconnect the the socket and exit process
 */
Client.prototype.disconnect = function () {
    try {
        Logger.info('Client is disconnecting and exiting. Bye');
        this.socket.disconnect();
    } catch (e) {
        //@TODO: error-handling
    } finally {
        process.exit(0);
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