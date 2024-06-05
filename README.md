# Umbrel CLI

This is a small CLI tool to help you create and manage your own [Umbrel](https://umbrel.com) apps.

## Get started

```bash
npm install -g umbrel-cli@latest
umbrel appstore create
```

## Features

- 🛍️ Support for the official Umbrel App Store as well as Community App Stores
- 🗺️ Guides you through the creation of an app or an Community App Store
- 🕵️ Finds errors in your app manifests and compose files early

## Documentation

### `umbrel appstore create <name>`

This command initializes an App Store.

`<name>` is an optional name for the App Store directory. When left empty, you get asked to provide one.

![aumbrel appstore create](assets/appstore-create.gif?raw=true)

### `umbrel app create <name>`

> [!NOTE]  
> This command can only be executed inside an App Store directory!

This command scaffoldes a new app. It needs to be invoked from inside an App Store directory.

`<name>` is an optional name for the app directory. When left empty, you get asked to provide one.

![aumbrel appstore create](assets/app-create.gif?raw=true)

### `umbrel lint`

> [!NOTE]  
> This command can only be executed inside an App Store directory!

This command checkes your App Store and all Apps inside it for potential errors.

These files are being checked:

- Validity of `umbrel-app-store.yml`
- Existence of `README.me`
- Validity of `<app>/umbrel-app.yml`
- Validity of `<app>/docker-compose.yml`
- (WIP) Validity of `<app>/exports.sh`

![aumbrel appstore create](assets/lint.gif?raw=true)

### `umbrel port generate`

This command generates a new and not yet used port to be used inside one of your apps.
It checks against the ports from the official App Store and when executed from a Community App Store,
also against those ports.

![aumbrel appstore create](assets/port-generate.gif?raw=true)

## Roadmap

- [x] 🛍️ Creating a Community App Store / cloning the official Umbrel App Store
- [x] 🗺️ Creating an app
- [ ] ⬇️ Creating an update an app
- [x] 🕵️ Linting apps and appstores using `umbrel lint`
- [ ] 🧪 Testing an app using `umbrel test <appid>`

## Development

To build and run the Umbrel CLI, simply clone this repository and run the following commands:

```bash
npm install
npm run dev -- -- --help
```

## Run Umbrel OS

To test your Umbrel apps, you need to run Umbrel OS on your machine.

Prerequisites:

- [Multipass](https://multipass.run/install)

This method diviates from the official installation method in that it clones the repository inside the vm
instead of on the machine. This is necessary to ensure that in Windows the correct +x flags are set and the
line breaks (\n instead of \r\n) are correct.

```bash
# Feel free to bump the specs
multipass launch --name umbrel-dev --cpus 4 --memory 8G --disk 50G 23.10
# Fake the mount directory by creating it manually
multipass exec umbrel-dev -- sudo mkdir /opt/umbrel-mount
multipass exec umbrel-dev -- sudo chown ubuntu:ubuntu /opt/umbrel-mount
# Cloning instead of mounting ensures the correct +x flags are set and the line breaks (\n instead of \r\n) are correct
multipass exec umbrel-dev -- git clone https://github.com/getumbrel/umbrel.git /opt/umbrel-mount
multipass exec umbrel-dev -- /opt/umbrel-mount/scripts/vm provision
```
