# PM2 Webhook

## Installation

You have to have pm2 already installed. Just add module

```sh
pm2 install pm2-webhook
```

## Usage

Add environment variables in your ecosystem.json file.

```sh
{
    "apps": [
        {
            ...,
            "env": {
                "WEBHOOK_PORT": 12345,
                "WEBHOOK_PATH": "/webhook",
                "WEBHOOK_SECRET": "pwd"
            }
        },
        ...
    ]
}
```