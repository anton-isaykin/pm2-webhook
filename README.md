# PM2 Webhook

[![npm](https://img.shields.io/npm/v/pm2-webhook.svg)](https://www.npmjs.com/package/pm2-webhook)

PM2 module for handling webhooks and realtime updating your project.

It supports many listening ports and pathes for different projects at the same time.

## Installation

You have to have pm2 already installed. Just add module

```sh
pm2 install pm2-webhook
```

## Usage

### GitHub webhook

Your repository page → Settings → Webhooks & services → Add webhook

|---|---|
| Payload URL | http://example.com:23928/webhook |
| Content Type | application/json |
| Secret | SECRET |

### PM2 config

Add environment variables in your [ecosystem.json](http://pm2.keymetrics.io/docs/usage/application-declaration/) file. Only __WEBHOOK_PORT__ variable is mandatory.

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

That's it. Each time you push in your repository, module runs `pm2 pull <app name>` method for your process.