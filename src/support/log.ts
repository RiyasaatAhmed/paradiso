/** Every line the server prints goes through here, indented so the startup
 *  banner and the request log read as one block in the terminal. */
const stamp = (): string => new Date().toTimeString().slice(0, 8);

export const log = {
  info: (message: string): void => console.log(`  ${message}`),
  request: (from: string, method: string, path: string): void =>
    console.log(`  ${stamp()}  <- ${from}  ${method} ${path}`),
  warn: (message: string): void => console.warn(`  ! ${message}`),
  error: (message: string): void => console.error(`  ! ${message}`),
  blank: (): void => console.log(''),
};
