var pm2 = require('pm2'),
    crypto = require('crypto'),
    http = require('http'),
    _ = require('lodash'),
    exec = require('child_process').exec,
    async = require('async');

var servers = {};
var webhooks = {};
var usedPorts = [];

module.exports = function () {
    pm2.connect(function () {
        pm2.list(function (err, procs) {
            processList(procs);
        });

        pm2.launchBus(function (err, bus) {
            bus.on('process:event', function (proc) {
                if (proc && proc.event == 'online' && !_.has(webhooks, proc.process.name)) {
                    var env = proc.process.env_webhook;

                    webhooks[proc.process.name] = {
                        port: env.port,
                        path: env.path || '',
                        secret: env.secret || '',
                        pre_hook: env.pre_hook || '',
                        post_hook: env.post_hook || ''
                    };

                    addServer(env.port);
                }

                if (proc && proc.event == 'exit' && _.has(webhooks, proc.process.name)) {
                    removeServer( webhooks[proc.process.name].port );
                    delete webhooks[proc.process.name];
                }
            })
        });
    });
};

function processList(processes) {

    processes.forEach(function (proc) {
        if (!proc.pm2_env || !proc.pm2_env.env_webhook || !proc.pm2_env.env_webhook.port || !proc.pm2_env.versioning) {
            return;
        }
        var env = proc.pm2_env.env_webhook;

        var port = parseInt(env.port);

        if (port <= 1024) {
            return;
        }

        if (!servers[port]) {
            addServer(port);
        }

        webhooks[proc.name] = {
            port: port,
            path: env.path || '',
            secret: env.secret || '',
            pre_hook: env.pre_hook || '',
            post_hook: env.post_hook || ''
        };

        usedPorts.push(port);
    });
}

function processRequest(port, url, body, headers) {
    for (var name in webhooks) {
        var options = webhooks[name];

        if (options.port !== port) {
            continue;
        }

        if (options.path.length && options.path != url) {
            continue;
        }

        if (options.secret.length) {
            var hmac = crypto.createHmac('sha1', options.secret);
            hmac.update(body, 'utf-8');

            var xub = 'X-Hub-Signature';
            var received = headers[xub] || headers[xub.toLowerCase()];
            var expected = 'sha1=' + hmac.digest('hex');

            if (received !== expected) {
                continue;
            }
        }

        pullAndReload(name);
    }
}

function addServer(port) {
    console.info('pm2-webhook::','Create server on port %d', port);

    servers[port] = http
        .createServer(function (request, response) {
            response.writeHead(200, {'Content-Type': 'text/plain'});
            response.write('Received');
            response.end();

            if (request.method !== 'POST') {
                return;
            }

            var body = '';
            request
                .on('data', function(data) {
                    body += data;
                })
                .on('end', function () {
                    processRequest(port, request.url, body, request.headers);
                });

        })
        .listen(port)
        .unref();
}

function removeServer(port) {

    if (!servers[port]) {
        return;
    }

    console.info('pm2-webhook::','Remove server on port %d', port);

    servers[port].close(function(err) {
        if (err) return console.error('pm2-webhook::', err);
        delete servers[port];
    });
}

function pullAndReload(name) {
    var current_app = webhooks[name];

    async.series([
        // Pre-hook
        function (callback) {
            if (!current_app.pre_hook) return callback(null);

            pm2.describe(name, function (err, apps) {
                if (err || !apps || apps.length === 0) return callback(err || new Error('Application not found'));

                var cwd = apps[0].pm_cwd ? apps[0].pm_cwd : apps[0].pm2_env.pm_cwd;
                console.log('CWD::', cwd);

                exec(current_app.pre_hook, { cwd: cwd }, function (err, stdout, stderr) {
                    if (err) return callback(err);

                    console.log('Pre-hook command has been successfuly executed for app %s', name);
                    return callback(null);
                })
            })
        },

        // Pull and restart
        function (callback) {
            pm2.pullAndRestart(name, function (err, meta) {
                if (err) return callback(err);
                console.log("Successfuly pull and reloaded application %s", name);
                return callback(null);
            })
        },

        // Post-hook
        function (callback) {
            if (!current_app.pre_hook) return callback(null);

            pm2.describe(name, function (err, apps) {
                if (err || !apps || apps.length === 0) return callback(err || new Error('Application not found'));

                var cwd = apps[0].pm_cwd ? apps[0].pm_cwd : apps[0].pm2_env.pm_cwd;

                exec(current_app.post_hook, {cwd: cwd}, function (err, stdout, stderr) {
                    if (err) {
                        console.log('Error::', err);
                        return callback(err);
                    }

                    console.log('Post-hook command has been successfuly executed for app %s', name);
                    return callback(null);
                })
            })
        },
    ], function (err, results) {
        if (err) {
            console.log('An error has occuring while processing app %s', name);
            console.log(err);
        }
    })
}