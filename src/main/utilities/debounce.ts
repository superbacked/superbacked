import { useCallback, useRef } from "react"

export function useDebounce<
  T extends (...args: never[]) => unknown | Promise<unknown>,
>(callback: T, delay: number): T {
  const lastExecutionRef = useRef(0)

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now()
      if (now - lastExecutionRef.current < delay) {
        return undefined
      }
      lastExecutionRef.current = now
      return callback(...args)
    },
    [callback, delay]
  ) as T
}
