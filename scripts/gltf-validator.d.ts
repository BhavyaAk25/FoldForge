declare module "gltf-validator" {
  export interface ValidationOptions {
    readonly uri: string;
    readonly format: "glb" | "gltf";
    readonly writeTimestamp?: boolean;
    readonly maxIssues?: number;
  }

  export const validateBytes: (
    data: Uint8Array,
    options: ValidationOptions,
  ) => Promise<unknown>;

  export const version: () => string;
}
