[![Build Status](https://travis-ci.org/beevelop/corci-client.svg?branch=master)](https://travis-ci.org/beevelop/corci-client)
[![Dependency Status](https://gemnasium.com/beevelop/corci-client.svg)](https://gemnasium.com/beevelop/corci-client)
[![Code Climate](https://codeclimate.com/github/beevelop/corci-client/badges/gpa.svg)](https://codeclimate.com/github/beevelop/corci-client)
[![GitHub release](https://img.shields.io/github/release/beevelop/corci-client.svg?style=flat)](https://github.com/beevelop/corci-client/releases)
[![GitHub issues](https://img.shields.io/github/issues/beevelop/corci-client.svg?style=flat)](https://github.com/beevelop/corci-client/issues)

# CorCI-client

> A convenient way to handle your own cordova builds without relying on Phonegap Build.

# Disclaimer

This project is currently under heavy development and might be unstable. Don't use it in production (unless you're adventurous).

# Usage

```
Sends a build request to the CorCI-master.

Additionally you can append platform-specific files by using the target name (e.g. android) as an argument.

  --help                       Show help
  -v, --version                Show version number
  -p, --port                   Port the client should connect to                                                      [default: 8000]
  -q, --protocol               Protocol the server is reachable at (https requires key and cert argument)             [default: "http"]
  -h, --host                   the server's hostname                                                                  [default: "localhost"]
  -k, --keep                   Amount of builds in location to keep (0 = unlimited)                                   [default: 0]
  -l, --location               Path to directory where binaries should be stored (leave empty to not store binaries)
  -t, --platform, --platforms  Define a platform / target (e.g. android); use multiple times for multiple platforms   [default: "autodetect"]
  -f, --file                   Path to the cordova project's zip file                                                 [required]
  -n, --name                   the app's name                                                                         [default: "corci"]

```