export const KUBEJS_NATIVE_EVENT_POLICY =
  " verify ForgeEvents/NativeEvents against runtime and ProbeJS: core KubeJS 1.20.1 ForgeEvents is startup_scripts-only; NativeEvents needs EventJS on 1.20.1 or core KubeJS 1.21.1+; never move native event handlers across scopes without evidence,";

export const KUBEJS_GLOBAL_STATE_POLICY =
  " treat global/Global usage as shared KubeJS state requiring existing-script ownership evidence, named keys/functions, and explicit lifecycle boundaries; avoid hidden mutable globals,";

export const KUBEJS_SCRIPTING_POLICY_TEXT =
  "KubeJS policy: treat scripts as Minecraft lifecycle scripting, not a generic JS project; use ProbeJS/d.ts evidence; verify ForgeEvents, NativeEvents, and global/Global usage against runtime/addons and existing scripts; avoid persistent console.* debug output.";

