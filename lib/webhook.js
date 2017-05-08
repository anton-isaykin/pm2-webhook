var pm2 = require('pm2'),
    crypto = require('crypto'),
    http = require('http');

var servers = {};
var webhooks = {};

module.exports = function () {

    pm2.connect(function () {

        console.log('Module pm2-webhook connected to pm2');

        setInterval(function () {
            pm2.list(function (err, procs) {
                processList(procs);
            });
        }, 2000);

    });
};

function processList(processes) {

    webhooks = {};
    var usedPorts = [];

    processes.forEach(function (proc) {
        if (!proc.pm2_env || !proc.pm2_env.env_webhook || !proc.pm2_env.env_webhook.port || !proc.pm2_env.versioning) {
            return;
        }

        var env = proc.pm2_env.env_webhook;

        var port = parseInt(env.port);

        if (port <= 1024) {
            console.error('Port value "%s" is incorrect', env.port);
            return;
        }

        if (!servers[port]) {
            addServer(port);
        }
        webhooks[proc.name] = {
            port: port,
            path: env.path || '',
            secret: env.secret || ''
        };

        usedPorts.push(port);
    });

    // remove old servers
    for (var port in servers) {
        if (!~usedPorts.indexOf(parseInt(port))) {
            removeServer(port);
        }
    }

}

function processRequest(port, url, body, headers) {

    console.log('Received request', port, url);

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
                console.error('Wrong secret. Expected %s, received %s', expected, received);
                continue;
            }

            console.info('Secret test passed');
        }

        pullAndReload(name);
    }
}

function addServer(port) {
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
    console.info('Remove server on port %d', port);
    if (!servers[port]) {
        return;
    }

    servers[port].close(function(err) {
        console.info('Server on port %d was closed', port);
        delete servers[port];
    });
}

function pullAndReload(name) {
    console.log('Pull and reload app %s', name);

    pm2.pullAndReload(name, function (err, meta) {
        if (err) {
            console.log('App %s already at latest version', name);
            return;
        }
        if (meta.rev) {
            console.log(
                'Successfully pulled ' + name + ' [Commit id: %s] [Repo: %s] [Branch: %s]',
                meta.rev.current_revision,
                meta.procs[0].pm2_env.versioning.repo_path,
                meta.procs[0].pm2_env.versioning.branch
            );
        }
    });
}