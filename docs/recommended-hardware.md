# Recommended hardware

The following is a list of hardware that has been tested by the Superbacked team or [contributors](#how-to-test-hardware-and-contribute-to-this-list).

| Computer model                            | Operating system | Version | Camera       | Bad lighting | Good lighting | Tested by   |
| ----------------------------------------- | ---------------- | ------- | ------------ | ------------ | ------------- | ----------- |
| MacBook Air (M2, 2022)                    | macOS Sequoia    | 15.4.1  | Built-in     | ✅           | ✅            | Superbacked |
| MacBook Pro (Retina, 13-inch, Early 2015) | Superbacked OS   | 1.7.2   | Razer Kiyo X | ✅           | ✅            | Superbacked |
| MacBook Pro (Retina, 13-inch, Early 2015) | macOS Monterey   | 12.7.6  | Built-in     |              | ✅            | Superbacked |
| ThinkPad X1 Carbon Gen 10 (14” Intel)     | Superbacked OS   | 1.7.2   | Built-in     |              | ✅            | Superbacked |

## How to test hardware and contribute to this list

### Step 1: download and print [reference](./reference-blocks/65bbe27d.pdf) block at 100% scale on 8.5 x 11-inch paper (resulting in 3 x 3-inch QR code).

### Step 2: download and install Superbacked app or run Superbacked OS

### Step 3: restore reference block in bad lighting (example: at night in dim lighting)

If passphrase prompt is displayed, please enter “✅” under “Bad lighting”.

### Step 4: restore reference block in good lighting (example: during the day near a window)

If passphrase prompt is displayed, please enter “✅” under “Good lighting”.

### Step 5: clone repo, create and switch to `recommended-hardware` branch and add line to table at the right position (sorted alphabetically)

Heads-up: when contributing to the list, please use the following links to translate Mac model identifier such as “Mac14,2” to computer model (see `sysctl -n hw.model`) and enter “Contributor” under “Tested by”.

- Identify MacBook Air 👉 https://support.apple.com/en-us/102869
- Identify MacBook Pro 👉 https://support.apple.com/en-us/108052

### Step 6: submit [signed](./README.md#how-to-sign-pull-request) pull request

**Thanks for helping out!**
