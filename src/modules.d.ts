// Module declarations for packages without bundled TypeScript types.
// Only needed for `tsc -b`; Vite resolves them at build time.

declare module "next-themes" {
  export function useTheme(): any;
  export const ThemeProvider: any;
}

declare module "class-variance-authority" {
  export function cva(...args: any[]): any;
  export type VariantProps<T extends (...args: any[]) => any> = any;
}

declare module "@tailwindcss/vite" {
  const plugin: () => any;
  export default plugin;
}

declare module "input-otp" {
  export const OTPInput: any;
  export const OTPInputContext: any;
}
