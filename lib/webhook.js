var pm2 = require('pm2'),
    crypto = require('crypto'),
    http = require('http'),
    _ = require('lodash'),
    exec = require('child_process').exec,
    async = require('async');

var servers = {};
var webhooks = {};

module.exports = function () {
    pm2.connect(function () {
        pm2.list(function (err, procs) {
            processList(procs);
        });

        pm2.launchBus(function (err, bus) {
            bus.on('process:event', function (proc) {
                if (proc && proc.event == 'online' && !_.has(webhooks, proc.process.name)) {
                    var env = proc.process.env_webhook;

                    if (!env) return;

                    var port = parseInt(env.port);

                    if (port <= 1024) {
                        console.log('Error! Port must be greater than 1024, you are trying to use', port);
                        return;
                    }

                    webhooks[proc.process.name] = {
                        port: port,
                        path: env.path || '',
                        type: env.type || 'pullAndRestart',
                        secret: env.secret || '',
                        pre_hook: env.pre_hook || '',
                        post_hook: env.post_hook || ''
                    };

                    try {
                        webhooks[proc.process.name] && addServer(env.port);
                    } catch(error) {
                        console.log('Error occurs while creating server', error);
                    }

                }

                if (proc && proc.event == 'exit' && _.has(webhooks, proc.process.name)) {
                    try {
                        webhooks[proc.process.name] && removeServer( webhooks[proc.process.name].port );
                    } catch(error) {
                        console.log('Error occurs while removing server', error);
                    }

                    webhooks[proc.process.name] && delete webhooks[proc.process.name];
                }
            })
        });
    });
};

function processList(processes) {

    console.log('Start webhook!');
    console.log('Found', _.result(processes, "length"), 'processes');

    processes.forEach(function (proc) {
        console.log('Process', proc.name);

        if (!_.result(proc,"pm2_env", false) || !_.result(proc, "pm2_env.env_webhook", false) || !_.result(proc,"pm2_env.env_webhook.port", false)) {
            console.log('Environment problem for process', proc.name);
            return;
        }

        var env = _.result(proc, "pm2_env.env_webhook");

        var port = parseInt(env.port);

        console.log('Process port', port, 'for process', proc.name);

        if (port <= 1024) {
            console.log('Error! Port must be greater than 1024, you are trying to use', port);
            return;
        }

        if (!_.has(servers, port)) {
            try {
                addServer(port);
            } catch(error) {
                console.log('Error occurs while creating server', error);
            }
        }

        webhooks[proc.name] = {
            port: port,
            path: env.path || '',
            type: env.type || 'pullAndRestart',
            secret: env.secret || '',
            pre_hook: env.pre_hook || '',
            post_hook: env.post_hook || ''
        };
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
    console.info('Create server on port ', port);

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

    console.info('Remove server on port ', port);

    servers[port].close(function(err) {
        if (err) return console.error('Error occurs while removing server on port ', err);
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

                exec(current_app.pre_hook, { cwd: cwd }, function (err, stdout, stderr) {
                    if (err) return callback(err);

                    console.log('Pre-hook command has been successfuly executed for app %s', name);
                    return callback(null);
                });

                return callback(null);
            })
        },

        // Pull and restart
        function (callback) {
            console.log('Try to pull', name);
            pm2[current_app.type].call(pm2, name, function (err, meta) {
                if (err) return callback(err);
                console.log("Successfuly", current_app.type, "application", name);
                return callback(null);
            })
        },

        // Post-hook
        function (callback) {
            if (!current_app.post_hook) return callback(null);

            pm2.describe(name, function (err, apps) {
                if (err || !apps || apps.length === 0) return callback(err || new Error('Application not found'));

                var cwd = apps[0].pm_cwd ? apps[0].pm_cwd : apps[0].pm2_env.pm_cwd;

                exec(current_app.post_hook, {cwd: cwd}, function (err, stdout, stderr) {
                    if (err) {
                        console.log('Error::', err);
                        return callback(err);
                    }

                    console.log('Post-hook command has been successfuly executed for app', name);
                    return callback(null);
                })
            })
        }
    ], function (err, results) {
        if (err) {
            console.log('An error has occuring while processing app', name);
            console.log(err);
        }
    })
}