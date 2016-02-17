# PM2-Webhook

[![npm](https://img.shields.io/npm/v/pm2-webhook.svg)](https://www.npmjs.com/package/pm2-webhook)
[![npm](https://img.shields.io/npm/dm/pm2-webhook.svg)](https://www.npmjs.com/package/pm2-webhook)

[PM2](https://github.com/Unitech/pm2) module to process webhooks and update your project realtime. Supports multiple ports and pathes.

## Installation

You must have pm2 installed. Just add module

```sh
pm2 install pm2-webhook
```

## Usage

### GitHub webhook

Your repository page → Settings → Webhooks & services → Add webhook

| Field | Value |
|---|---|
| Payload URL | http://example.com:23928/webhook |
| Content Type | application/json |
| Secret | SECRET |

### PM2 config

Add environment variables in your [ecosystem.json](http://pm2.keymetrics.io/docs/usage/application-declaration/) file. Only `WEBHOOK_PORT` variable is mandatory.

```sh
{
    "apps": [
        {
            "name": "app",
            "env": {
                "WEBHOOK_PORT": 23928,
                "WEBHOOK_PATH": "/webhook",
                "WEBHOOK_SECRET": "SECRET"
            },
            ...
        },
        ...
    ]
}
```

Restart your processes with `pm2 startOrGracefulReload ecosystem.json`.

That's it. Each time you push to your repository, this module runs `pm2 pull <app name>`.

## Copyright and license

Copyright 2016 Anton Isaykin.

Licensed under the [MIT License](https://github.com/oowl/pm2-webhook/blob/master/LICENSE).

Any feedback is [welcome](https://github.com/oowl/pm2-webhook/issues).
If you like it, please [star on GitHub](https://github.com/oowl/pm2-webhook).