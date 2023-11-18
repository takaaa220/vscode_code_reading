import { relative } from "path";
import { MemoContent } from "./memo";
import * as vscode from "vscode";
import { truncate } from "./helper";
import { Commands } from "./command";
import { outputMarkdown } from "./output";

export const MemoReflector = (
  projectRoot: string,
  memoContents: MemoContent[]
) => {
  const provider = new CodelensProvider(projectRoot, memoContents);
  const decorator = InlineDecorator(projectRoot);

  const refresh = (editor: vscode.TextEditor, memoContents: MemoContent[]) => {
    provider.refresh(memoContents);
    decorator.reflect(editor, memoContents);
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

// TODO: Fix the bug that decorations are not removed when deleted
const InlineDecorator = (projectRoot: string) => {
  const map = new Map<
    MemoContent["filePath"],
    vscode.TextEditorDecorationType[]
  >();

  const reflect = (
    editor: vscode.TextEditor,
    memoJSONContents: MemoContent[]
  ) => {
    const relativeFilePath = relative(projectRoot, editor.document.fileName);

    const targetMemoJSONContents = memoJSONContents.filter(
      (memoJSONContent) => memoJSONContent.filePath === relativeFilePath
    );

    // Remove decorations applied to the file (to avoid duplication)
    targetMemoJSONContents.forEach((memoJSONContent) => {
      map.get(memoJSONContent.filePath)?.forEach((decorationType) => {
        editor.setDecorations(decorationType, []);
        decorationType.dispose();
      });

      map.delete(memoJSONContent.filePath);
    });

    targetMemoJSONContents.forEach((memoJSONContent) => {
      const decorationTypeForText =
        vscode.window.createTextEditorDecorationType({
          after: {
            contentText: `📝 ${truncate(memoJSONContent.memo, 30)}`,
            margin: "0 0 0 16px",
            color: "rgba(153, 153, 153, 0.7)",
          },
          isWholeLine: true,
        });
      const rangeForText = new vscode.Range(
        memoJSONContent.startLine,
        0,
        memoJSONContent.startLine,
        0
      );
      editor.setDecorations(decorationTypeForText, [
        {
          range: rangeForText,
          hoverMessage: new vscode.MarkdownString(
            outputMarkdown(memoJSONContent)
          ),
        },
      ]);

      const decorationTypeForBackground =
        vscode.window.createTextEditorDecorationType({
          backgroundColor: "rgba(153, 153, 153, 0.1)",
          rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        });
      const rangeForBackground = new vscode.Range(
        memoJSONContent.startLine,
        memoJSONContent.startCharacter,
        memoJSONContent.endLine,
        memoJSONContent.endCharacter
      );
      editor.setDecorations(decorationTypeForBackground, [rangeForBackground]);

      map.set(memoJSONContent.filePath, [
        ...(map.get(memoJSONContent.filePath) ?? []),
        decorationTypeForText,
        decorationTypeForBackground,
      ]);
    });
  };

  return {
    reflect,
  };
};
