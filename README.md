# pm2-hook

[![npm](https://img.shields.io/npm/v/pm2-hook.svg)](https://www.npmjs.com/package/pm2-hook)
[![npm](https://img.shields.io/npm/dm/pm2-hook.svg)](https://www.npmjs.com/package/pm2-hook)

[PM2](https://github.com/Unitech/pm2) module to process webhooks and update your project realtime. Supports multiple ports and pathes, pre-hook and post-hook features, comparing branches, different types of updating.

This module is advanced version of [pm2-webhook](https://github.com/oowl/pm2-webhook) created by [Anton Isaykin](https://github.com/oowl).

## Installation

You must have pm2 installed. Just add module

```sh
pm2 install pm2-hook
```

## Usage

### GitHub/Bitbucket webhook

Your repository page → Settings → Webhooks & services → Add webhook

| Field | Value |
|---|---|
| Payload URL | http://example.com:27777/webhook |
| Content Type | application/json |
| Secret | some secret phrase |

### PM2 config

Options:

| Option | Type | Example | Required | Default |
|---|---|---|---|---|---|
| port | `number` | 27777 | `true` | |
| path | `string` | "/webhook" | `false` | `/` |
| secret | `string` | "some secret phrase" | `false` | |
| action | `string` | "pullAndReload" | `false` | `pullAndRestart` |
| pre_hook | `string` | "npm run stop" | `false` | |
| post_hook | `string` | "npm run generate_docs" | `false` | |

Some notes:

1. You can use all actions that described in [PM2 docs](http://pm2.keymetrics.io/docs/usage/pm2-api/) and takes process name as argument.
2. Webhook has compare branches feature. It make pull request only if catch request from VCS with correct branch (if current branch on your local git same with remote branch that contains in VCS request).

Add environment variables in your [ecosystem.json](http://pm2.keymetrics.io/docs/usage/application-declaration/) file. Only `port` variable is mandatory.

```sh
{
    "apps": [
        {
            "name": "app",
            ...
            "env_webhook": {
                "port": 23928,
                "path": "/webhook",
                "secret": "some secret phrase",
                "action": "pullAndReload",
                "pre_hook": "npm run stop",
                "post_hook": "npm run generate_docs"
            },
            ...
        },
        ...
    ]
}
```
If your process has been already started kill it using comand `pm2 delete ecosystem.json` (We need this, because PM2 has some problems with reloading process configuration and if only restart your process nothing will not work :cry:).
Start your processes with `pm2 start ecosystem.json`.

That's it. Each time you push to your repository, this module runs `pm2 pullAndReload <app name>`.

## Copyright and license

Copyright 2016 Yurii Kramarenko, Dmitry Poddubniy.

Licensed under the [MIT License](https://github.com/Dalas/pm2-webhook/blob/master/LICENSE).
