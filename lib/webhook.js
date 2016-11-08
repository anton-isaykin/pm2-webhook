var pm2 = require('pm2'),
    crypto = require('crypto'),
    http = require('http');


var webhook_options = {};


console.log('Module pm2-webhook connected to pm2');


module.exports = function () {

    pm2.connect(function () {

        console.log('Module pm2-webhook connected to pm2');

        var port = parseInt(env.port);

        webhook_options = {
            port: port,
            path: env.path || '',
            secret: env.secret || ''
        }

        startServer( port );
    });
};

function startServer( port ) {
    server = http
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

function processRequest(port, url, body, headers) {

    console.log('Received request', port, url);

    var options = webhook_options;

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
