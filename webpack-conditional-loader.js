import os from "os"

const startBlock = /(\/\/|{\/\*) #if ((?:(?! \*\/}).)*)( \*\/})?/
const endBlock = /(\/\/|{\/\*) #endif( \*\/})?$/

const rule = /process\.env\.([_A-Z0-9]+) === "[_a-z0-9]+"/

const parse = (sourceByLine) => {
  const lines = []
  let pushLine = true
  for (const line of sourceByLine) {
    let result
    if ((result = startBlock.exec(line))) {
      const startBlockRule = result[2]
      const ruleMatch = rule.exec(startBlockRule)
      // Fail closed — silently stripping a block because a rule cannot be
      // evaluated could ship a bundle with security-critical lines missing.
      if (!ruleMatch) {
        throw new Error(`Unsupported #if rule: ${startBlockRule}`)
      }
      if (process.env[ruleMatch[1]] === undefined) {
        throw new Error(
          `Cannot evaluate "#if ${startBlockRule}" because ${ruleMatch[1]} is not set`
        )
      }
      if (eval(startBlockRule) !== true) {
        pushLine = false
      }
      continue
    }
    if ((result = endBlock.exec(line))) {
      pushLine = true
      continue
    }
    if (pushLine === true) {
      lines.push(line)
    }
  }
  return lines
}

export default function loader(source) {
  try {
    const sourceByLine = source.split(os.EOL)
    const lines = parse(sourceByLine)
    return lines.join(os.EOL)
  } catch (error) {
    console.error(error)
    throw error
  }
}
