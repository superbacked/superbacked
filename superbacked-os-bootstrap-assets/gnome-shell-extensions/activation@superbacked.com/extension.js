// Grants the Superbacked app focus when Mutter refuses its activation
// request. This header is the one account of why; the app handler
// (src/handlers/focusWindow.ts), the bootstrap and the security
// document point here.
//
// Dropping a file onto a window hands it the file, not keyboard focus —
// the file manager keeps it. The app then asks for focus, but Mutter
// honors an activation token only when its serial is a button or key
// press on the requesting surface (token_can_activate in Mutter’s
// meta-wayland-activation.c), the press that started the drag belongs
// to the file manager and Chromium picks the serial itself — so the
// request is refused and keystrokes meant for a passphrase field land
// in the file manager (superbacked/superbacked#42). Nothing the app can
// do changes that: a newly mapped window does receive focus, and a
// closing window hands focus to its transient parent, but Electron sets
// no parent for child windows on Wayland (SetParentWindow in its
// native_window_views.cc), so a helper window hands focus back to the
// file manager instead.
//
// The compositor can, through two channels. When the refused window is
// obscured — overlapped by another window, minimized or on another
// workspace — Mutter flags it as demanding attention (the Shell’s
// “Superbacked is ready” notification) and this extension activates it
// instead, within the same dispatch, before a frame is painted, so the
// notification the Shell’s own handler created is torn down unseen.
// When the window is in full view Mutter emits nothing, so the app asks
// over the session bus (com.superbacked.Activation on the Shell’s
// connection, through gdbus) and the extension activates the
// Superbacked window under the pointer — the one the drop landed on.
//
// Focus is a boundary on this OS (keystrokes and the clipboard reach
// the focused window only), so both channels are bound to an identity
// no process can claim for itself: the AppArmor label, which the kernel
// assigns — read from /proc for the client process behind a window,
// which Mutter knows through the Wayland connection, and taken from the
// bus daemon for a caller, which captured it when the caller connected
// (no pid in the loop, so no pid reuse to race). Only the superbacked
// profile in a mediating mode qualifies — enforce on release images,
// complain on debug ones, never the unconfined mode the deb’s stock
// profile of the same name would carry — and never the app id, which
// any client of the session sets on its own toplevel, the browser
// through waypipe included. With no profile loaded the label is
// unconfined and the extension refuses, failing closed like every other
// layer. Every other app keeps GNOME’s focus-stealing prevention.

import Gio from "gi://Gio"
import GLib from "gi://GLib"
import Meta from "gi://Meta"
import Shell from "gi://Shell"

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js"
import * as Main from "resource:///org/gnome/shell/ui/main.js"

const SUPERBACKED_APP_ID = "superbacked.desktop"
const SUPERBACKED_LABEL = /^superbacked \((enforce|complain)\)$/

const ACTIVATION_OBJECT_PATH = "/com/superbacked/Activation"
const ACTIVATION_INTERFACE = `
<node>
  <interface name="com.superbacked.Activation">
    <method name="Activate"/>
  </interface>
</node>`

// Labels arrive NUL-terminated from the bus daemon and newline-terminated
// from /proc
const decodeLabel = (bytes) => {
  return new TextDecoder()
    .decode(bytes)
    .replace(/\0[\s\S]*$/, "")
    .trim()
}

const isSuperbackedLabel = (label) => {
  return label !== null && SUPERBACKED_LABEL.test(label)
}

// Newer kernels expose the label under attr/apparmor, older ones under
// attr alone — read whichever exists, null when neither does (process
// gone) or the pid is unknown
const readProcessLabel = (pid) => {
  if (pid <= 0) {
    return null
  }
  const paths = [
    `/proc/${pid}/attr/apparmor/current`,
    `/proc/${pid}/attr/current`,
  ]
  for (const path of paths) {
    try {
      const [ok, contents] = GLib.file_get_contents(path)
      if (ok === true) {
        return decodeLabel(contents)
      }
    } catch {
      // Try the next path
    }
  }
  return null
}

// The bus daemon records every connection’s security label at accept
// (SO_PEERSEC) and hands it out as LinuxSecurityLabel — the caller’s
// credential without resolving a pid first
const readCallerLabel = (invocation, callback) => {
  Gio.DBus.session.call(
    "org.freedesktop.DBus",
    "/org/freedesktop/DBus",
    "org.freedesktop.DBus",
    "GetConnectionCredentials",
    new GLib.Variant("(s)", [invocation.get_sender()]),
    new GLib.VariantType("(a{sv})"),
    Gio.DBusCallFlags.NONE,
    -1,
    null,
    (connection, result) => {
      try {
        const [credentials] = connection.call_finish(result).deepUnpack()
        const label = credentials.LinuxSecurityLabel
        callback(label === undefined ? null : decodeLabel(label.deepUnpack()))
      } catch {
        callback(null)
      }
    }
  )
}

// The app id is not a credential (any client sets its own) — it only
// spares the /proc read for the windows of every other app
const isSuperbackedWindow = (tracker, window) => {
  const app = tracker.get_window_app(window)
  if (app === null || app.get_id() !== SUPERBACKED_APP_ID) {
    return false
  }
  return isSuperbackedLabel(readProcessLabel(window.get_pid()))
}

const containsPointer = (window) => {
  const [x, y] = global.get_pointer()
  const rect = window.get_frame_rect()
  return (
    x >= rect.x &&
    x < rect.x + rect.width &&
    y >= rect.y &&
    y < rect.y + rect.height
  )
}

export default class ActivationExtension extends Extension {
  _dbus = null
  _handlerId = null
  _tracker = null

  enable() {
    this._tracker = Shell.WindowTracker.get_default()
    this._handlerId = global.display.connect(
      "window-demands-attention",
      (display, window) => {
        this._onWindowDemandsAttention(window)
      }
    )
    this._dbus = Gio.DBusExportedObject.wrapJSObject(
      ACTIVATION_INTERFACE,
      this
    )
    this._dbus.export(Gio.DBus.session, ACTIVATION_OBJECT_PATH)
  }

  disable() {
    if (this._dbus !== null) {
      this._dbus.unexport()
    }
    if (this._handlerId !== null) {
      global.display.disconnect(this._handlerId)
    }
    this._dbus = null
    this._handlerId = null
    this._tracker = null
  }

  _onWindowDemandsAttention(window) {
    if (window === null || window.has_focus() === true) {
      return
    }
    if (isSuperbackedWindow(this._tracker, window) === false) {
      return
    }
    Main.activateWindow(window)
  }

  // The Superbacked window the pointer is over — where the drop landed —
  // falling back to the most recently used one; MRU order from the
  // Shell’s tab list, all workspaces
  _pickWindow() {
    const windows = global.display
      .get_tab_list(Meta.TabList.NORMAL_ALL, null)
      .filter((window) => isSuperbackedWindow(this._tracker, window))
    return windows.find(containsPointer) ?? windows[0] ?? null
  }

  // GJS routes a method named <Method>Async here with the invocation.
  // The credential check happens in a bus callback, after which the
  // extension may have been disabled (the Shell disables extensions on
  // a session-mode change such as the lock screen) — answered with an
  // error rather than left hanging
  ActivateAsync(parameters, invocation) {
    readCallerLabel(invocation, (label) => {
      if (isSuperbackedLabel(label) === false) {
        invocation.return_dbus_error(
          "org.freedesktop.DBus.Error.AccessDenied",
          "Caller is not confined by the superbacked profile"
        )
        return
      }
      if (this._tracker === null) {
        invocation.return_dbus_error(
          "org.freedesktop.DBus.Error.Failed",
          "Extension disabled"
        )
        return
      }
      const window = this._pickWindow()
      if (window === null) {
        invocation.return_dbus_error(
          "org.freedesktop.DBus.Error.Failed",
          "No Superbacked window"
        )
        return
      }
      if (window.has_focus() === false) {
        Main.activateWindow(window)
      }
      invocation.return_value(null)
    })
  }
}
