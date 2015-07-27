#!/usr/bin/env node
var path = require('path');
var Client = require('../lib/Client');

var libs = require('corci-libs');
var Logger = libs.Logger;
var Common = libs.Common;
var yargs = Common.yargs;
var fs = Common.fsExtra;

Logger.addLevels({
    client: 3
}, {
    client: 'magenta'
});

var conf = yargs
    .help('help')
    .version('0.1.0', 'v')
    .alias('v', 'version')
    .showHelpOnFail(true)
    .usage('Sends a build request to the CorCI-master.\n' +
            'Usage: $0\nAdditionally you can append platform-specific f' +
            'iles by using the target name (e.g. android) as an argument.')
    .config('c')
    .options('p', {
        alias: 'port',
        default: 8000,
        describe: 'Port the client should connect to'
    })
    .options('q', {
        alias: 'protocol',
        default: 'http',
        describe: 'Protocol the server is reachable at (https requires key and cert argument)'
    })
    .options('h', {
        alias: 'host',
        default: 'localhost',
        describe: 'the server\'s hostname'
    })
    .options('k', {
        alias: 'keep',
        default: 0,
        describe: 'Amount of builds in location to keep (0 = unlimited)'
    })
    .options('l', {
        alias: 'location',
        describe: 'Path to directory where binaries should be stored (leave empty to not store binaries)'
    })
    .options('t', {
        alias: ['platform', 'platforms'],
        default: 'autodetect',
        describe: 'Define a platform / target (e.g. android); use multiple times for multiple platforms'
    })
    .options('f', {
        alias: 'file',
        describe: 'Path to the cordova project\'s zip file',
        require: true
    })
    .options('n', {
        alias: 'name',
        default: 'corci',
        describe: 'the app\'s name'
    })
    .check(function (args, opts) {
        if (!args.name.match(/^[a-z0-9-]+$/)) {
            throw 'Error: name should follow these rules: [a-z0-9-]'
        }

        var filePath = path.resolve(args.file);
        if (fs.existsSync(filePath)) {
            args.file = filePath;
        } else {
            throw 'Error: file could not be found ' +
                    '(note: the path has to be relative ' +
                    'to your current working directory)';
        }
    })
    .argv;

// Convert conf.platforms to an array if it is a string
// additionally split by comma to cover usage mistakes
if (typeof conf.platforms === 'string') {
    conf.platforms = conf.platforms.split(',');
}

// Assemble the master's socket url from the provided conf values
conf.url = '{0}://{1}{2}/{3}'.format(
    conf.protocol,
    conf.host,
    conf.port === 80 ? '' : ':' + conf.port,
    'client'
);

if (!conf.location) {
    conf.save = false;
}

var client = new Client(conf);