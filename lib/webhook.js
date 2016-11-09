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
        //console.log('pm2-webhook:name::',proc.name);
        var env = proc.pm2_env.env_webhook;

        var port = parseInt(env.port);

        if (port <= 1024) {
            //console.error('pm2-webhook::','Port value "%s" is incorrect', env.port);
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

    //console.log('pm2-webhook::','Received request', port, url);
    //console.log('pm2-webhook::','webhooks', webhooks);

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
                //console.error('pm2-webhook::','Wrong secret. Expected %s, received %s', expected, received);
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
        //console.info('pm2-webhook::','Server on port %d was closed', port);
        delete servers[port];
    });
}

function pullAndReload(name) {
    var current_app = webhooks[name];

    async.series([
        // Pre-hook
        function (callback) {
            console.log('pm2-webhook::','Prehook %s', name);
            if (!current_app.pre_hook) return callback(null);

            pm2.describe(name, function (err, apps) {
                if (err || !apps || apps.length === 0) return callback(err || new Error('Application not found'));

                var cwd = apps[0].pm_cwd ? apps[0].pm_cwd : apps[0].pm2_env.pm_cwd;

                console.log(cwd);

                /*exec(current_app.prehook, { cwd: cwd }, function (err, stdout, stderr) {
                    if (err) return callback(err);

                    console.log('[%s] Pre-hook command has been successfuly executed for app %s', new Date().toISOString(), target_name);
                    return callback(null);
                })*/
            })
        },

        function (callback) {
            console.log('pm2-webhook::','Pull and restart app %s', name);
            pm2.pullAndRestart(name, function (err, meta) {
                if (err) return callback(err);
                console.log("[%s] Successfuly pull and reloaded application %s", new Date().toISOString(), name);
            })
        },

        // Pre-hook
        function (callback) {
            console.log('pm2-webhook::','Posthook %s', name);
            if (!current_app.pre_hook) return callback(null);

            pm2.describe(name, function (err, apps) {
                if (err || !apps || apps.length === 0) return callback(err || new Error('Application not found'));

                var cwd = apps[0].pm_cwd ? apps[0].pm_cwd : apps[0].pm2_env.pm_cwd;

                console.log(cwd);
                return callback(null);

                /*exec(current_app.prehook, { cwd: cwd }, function (err, stdout, stderr) {
                 if (err) return callback(err);

                 console.log('[%s] Pre-hook command has been successfuly executed for app %s', new Date().toISOString(), target_name);
                 return callback(null);
                 })*/
            })
        },
    ], function (err, results) {
        if (err) {
            console.log('An error has occuring while processing app %s', target_name);
            console.log(err);
        }
    })
}