export type ValidationCommand = {
  stage: "native_check" | "native_debug_automation_build";
  executable: string;
  args: string[];
  cwd: string;
};

export function nativeValidationCommands(
  nativeExecutable: string,
  projectRoot: string,
): ValidationCommand[] {
  return [
    {
      stage: "native_check",
      executable: nativeExecutable,
      args: ["check", ".", "--strict"],
      cwd: projectRoot,
    },
    {
      stage: "native_debug_automation_build",
      executable: nativeExecutable,
      args: ["dev", ".", "-Dautomation=true"],
      cwd: projectRoot,
    },
  ];
}
