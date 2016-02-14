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
        if (!proc.pm2_env || !proc.pm2_env.WEBHOOK_PORT || !proc.pm2_env.versioning) {
            return;
        }

        var port = parseInt(proc.pm2_env.WEBHOOK_PORT);

        if (port <= 1024) {
            console.error('Port value "%s" is incorrect', proc.pm2_env.WEBHOOK_PORT);
            return;
        }

        if (!servers[port]) {
            addServer(port);
        }
        webhooks[proc.name] = {
            port: port,
            path: proc.pm2_env.WEBHOOK_PATH || '',
            secret: proc.pm2_env.WEBHOOK_SECRET || ''
        };

        usedPorts.push(port);
    });

    // remove old servers
    for (var port in servers) {
        if (!~usedPorts.indexOf(parseInt(port))) {
            console.info('Remove server on port %d', port);
            removeServer(port);
        }
    }

}

function processRequest(port, path, body, headers) {

    console.log('Received request', port, path, body);

    for (var name in webhooks) {
        var options = webhooks[name];

        if (options.port !== port) {
            continue;
        }

        if (options.path.length && options.path != path) {
            continue;
        }

        if (options.secret.length) {
            var hmac = crypto.createHmac('sha1', options.secret);
            hmac.update(body);

            if (headers['x-hub-signature'] !== 'sha1=' + hmac.digest('hex')) {
                console.error('Wrong secret');
                continue;
            }
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

            var body = [];
            request
                .on('data', body.push)
                .on('end', function () {
                    if (request.method !== 'POST') {
                        return;
                    }
                    processRequest(port, request.url, Buffer.concat(body).toString(), request.headers);
                });

        })
        .listen(port);
}

function removeServer(port) {
    if (!servers[port]) {
        return;
    }

    servers[port].close(function() {
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