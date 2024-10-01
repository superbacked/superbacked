import spawn from "./spawn"

export const getSerial = async (): Promise<string> => {
  const { stdout } = await spawn("system_profiler", ["SPHardwareDataType"])
  const serial = stdout.match(/Serial Number \(system\): ([A-Z0-9]{10,12})/)
  if (!serial) {
    throw new Error("Could not get serial using system profiler")
  }
  return serial[1]
}
