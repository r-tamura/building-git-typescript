export const EEXIST = { code: "EEXIST" } as const;
export const ENOENT = { code: "ENOENT" } as const;
export const EACCES = { code: "EACCES" } as const;

export const FS_ERROR = {
  EEXIST,
  ENOENT,
  EACCES,
};
