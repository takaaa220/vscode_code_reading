import * as vscode from "vscode";

type Setting = {
  fileSuffix: string;
};

export const SettingReader = (): Setting => {
  const config = vscode.workspace.getConfiguration("codeReadingMemo");

  return {
    fileSuffix: config.get("fileSuffix") ?? "code_memo",
  };
};
