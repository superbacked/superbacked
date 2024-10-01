/**
 * Sleep for delay
 * @param delay delay in milliseconds
 * @returns promise
 */
export default async (delay: number) => {
  return new Promise((resolve) => setTimeout(resolve, delay))
}
