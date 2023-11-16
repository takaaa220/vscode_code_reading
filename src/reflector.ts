import { relative } from "path";
import { MemoContent } from "./memo";
import * as vscode from "vscode";
import { truncate } from "./helper";
import { Commands } from "./command";

export const MemoReflector = (
  projectRoot: string,
  memoContents: MemoContent[]
) => {
  const provider = new CodelensProvider(projectRoot, memoContents);

  const refresh = (memoContents: MemoContent[]) => {
    provider.refresh(memoContents);
  };

  return {
    provider,
    refresh,
  };
};

class CodelensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();

  constructor(
    private projectRoot: string,
    private memoContents: MemoContent[]
  ) {}

  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  public refresh(memoContents: MemoContent[]): void {
    this.memoContents = memoContents;

    this._onDidChangeCodeLenses.fire();
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const filePath = relative(this.projectRoot, document.fileName);

    return this.memoContents
      .filter((memoContent) => memoContent.filePath === filePath)
      .flatMap((memoContent) => {
        const range = new vscode.Range(
          memoContent.startLine,
          memoContent.startCharacter,
          memoContent.endLine,
          memoContent.endCharacter
        );

        const updateCommand: vscode.Command = {
          title: `Update "${truncate(memoContent.memo, 10)}"`,
          command: Commands.update,
          arguments: [memoContent.filePath, memoContent.id],
        };
        const removeCommand: vscode.Command = {
          title: `Remove "${truncate(memoContent.memo, 10)}"`,
          command: Commands.delete,
          arguments: [memoContent.filePath, memoContent.id],
        };

        return [
          new vscode.CodeLens(range, updateCommand),
          new vscode.CodeLens(range, removeCommand),
        ];
      });
  }
}
