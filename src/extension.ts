import * as vscode from "vscode";
import { join, relative } from "path";
import {
  accessSync,
  appendFileSync,
  constants,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { execSync } from "child_process";

export function activate(context: vscode.ExtensionContext) {
  const suffix = "code_memo";

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showInformationMessage("not in a workspace");
    return;
  }

  const projectRoot = workspaceFolders[0].uri.fsPath;

  const memoWriter = MemoWriter(projectRoot, suffix);
  const memoReflector = MemoReflector();

  const newMemo = async () => {
    const memoFiles = readdirSync(projectRoot)
      .filter((file) => file.endsWith(`.${suffix}.md`))
      .map((file) => file.replace(`.${suffix}.md`, ""));

    const newOption = "[Create new file]";

    const pickOptions = [newOption, ...memoFiles];
    const selected = await vscode.window.showQuickPick(pickOptions, {
      placeHolder: "Create new file or select existing memo",
    });

    if (!selected) {
      vscode.window.showErrorMessage("Please select options");
      return;
    }

    if (selected === newOption) {
      const title = await vscode.window.showInputBox({
        prompt: "Input memo title",
      });
      if (!title) {
        vscode.window.showErrorMessage("Please input memo title");
        return;
      }

      memoWriter.initializeMemo(title);
    } else {
      memoWriter.initializeMemo(selected);
    }

    vscode.window.showInformationMessage("Initialized memo!");
  };

  const addMemo = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No found active editor");
      return;
    }

    if (!memoWriter.initialized()) {
      await newMemo();
    }

    vscode.window.showInputBox({ prompt: "Input memo" }).then((inputText) => {
      if (inputText === undefined) {
        vscode.window.showErrorMessage("Please input memo");
        return;
      }

      const memoJSONContent = toMemoJSONContent({
        memo: inputText,
        document: editor.document,
        selection: editor.selection,
        projectRoot,
      });

      memoWriter.addMemo(memoJSONContent);

      memoReflector.reflect(
        editor,
        memoWriter.getMemoJSONContentsByFile(memoJSONContent.filePath)
      );

      vscode.window
        .showInformationMessage("Added memo!", "Open memo")
        .then((selection) => {
          if (selection !== "Open memo") {
            return;
          }

          vscode.workspace
            .openTextDocument(memoWriter.getCurrentActiveMarkdownFile())
            .then((doc) => {
              vscode.window.showTextDocument(doc);
            });
        });
    });
  };

  let disposeNewMemo = vscode.commands.registerCommand(
    "extension.newMemo",
    newMemo
  );
  let disposeAddMemo = vscode.commands.registerCommand(
    "extension.addMemo",
    addMemo
  );
  const disposeReflector = vscode.workspace.onDidOpenTextDocument(() => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    memoReflector.reflect(
      editor,
      memoWriter.getMemoJSONContentsByFile(
        relative(projectRoot, editor.document.fileName)
      )
    );
  });

  context.subscriptions.push(disposeNewMemo, disposeAddMemo, disposeReflector);
}

export function deactivate() {}

const MemoWriter = (projectRoot: string, suffix: string) => {
  let currentActiveFilePathWithoutExt = "";

  const memoStore = MemoStore(projectRoot, suffix);

  const initializeMemo = (title: string) => {
    const fileNameWithExt = title.replace(/\s/g, "_");
    currentActiveFilePathWithoutExt = `${projectRoot}/${fileNameWithExt}.${suffix}`;

    try {
      accessSync(getActiveMarkdownFilePath(), constants.F_OK);
    } catch {
      writeFileSync(getActiveMarkdownFilePath(), `# ${title}\n`);
    }

    try {
      accessSync(getActiveJSONFilePath(), constants.F_OK);
    } catch {
      writeFileSync(getActiveJSONFilePath(), "[]");
    }
  };

  const addMemo = (memoJSONContent: MemoJSONContent) => {
    if (!currentActiveFilePathWithoutExt) {
      return;
    }

    memoStore.addMemo(memoJSONContent);

    writeFileSync(
      getActiveJSONFilePath(),
      JSON.stringify(
        memoStore.getMemoJSONContentsByFile(memoJSONContent.filePath),
        null,
        2
      )
    );

    appendFileSync(
      getActiveMarkdownFilePath(),
      outputMarkdown(memoJSONContent)
    );
  };

  const getActiveMarkdownFilePath = () => {
    return currentActiveFilePathWithoutExt
      ? `${currentActiveFilePathWithoutExt}.md`
      : "";
  };

  const getActiveJSONFilePath = () => {
    return currentActiveFilePathWithoutExt
      ? `${currentActiveFilePathWithoutExt}.json`
      : "";
  };

  return {
    initialized: () => !!currentActiveFilePathWithoutExt,
    getCurrentActiveMarkdownFile: getActiveMarkdownFilePath,
    initializeMemo,
    addMemo,
    getMemoJSONContentsByFile: memoStore.getMemoJSONContentsByFile,
  };
};

type Output = (memoJSONContent: MemoJSONContent) => string;

const outputMarkdown: Output = ({
  memo,
  startLine,
  startCharacter,
  endLine,
  endCharacter,
  filePath,
  githubRemoteFilePath,
  selectedText,
}) => {
  const ext = filePath.split(".").pop();
  const codeBlock = `\`\`\`${ext ?? ""}\n${selectedText}\n\`\`\``;

  return `\n${memo}  \n[[ファイル](${filePath}#L${startLine + 1})]${
    githubRemoteFilePath
      ? ` [[GitHub](${githubRemoteFilePath}#L${startLine + 1}C${
          startCharacter + 1
        }-L${endLine + 1}C${endCharacter + 1})]`
      : ""
  }\n\n${codeBlock}\n`;
};

type MemoJSONContent = {
  filePath: string;
  githubRemoteFilePath?: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  memo: string;
  selectedText: string;
};

const toMemoJSONContent = ({
  memo,
  document,
  selection,
  projectRoot,
}: {
  memo: string;
  document: vscode.TextDocument;
  selection: vscode.Selection;
  projectRoot: string;
}): MemoJSONContent => {
  const startLine = selection.start.line;
  const startCharacter = selection.start.character;
  const endLine = selection.end.line;
  const endCharacter = selection.end.character;

  const relativeFilePath = relative(projectRoot, document.fileName);

  const githubRemoteFilePath = (() => {
    try {
      const remoteUrl = execSync(
        `cd ${projectRoot} && git config --get remote.origin.url`
      )
        .toString()
        .trim();
      const commitHash = execSync(`cd ${projectRoot} && git rev-parse HEAD`)
        .toString()
        .trim();

      const match = /github\.com[:/](.+)\/(.+)\.git/.exec(remoteUrl);
      if (!match) {
        return undefined;
      }

      const [, userName, repoName] = match;
      return `https://github.com/${userName}/${repoName}/blob/${commitHash}/${relativeFilePath}`;
    } catch {
      return undefined;
    }
  })();

  const selectedText = [...Array(endLine - startLine + 1).keys()]
    .map((_, i) => {
      const line = startLine + i;
      return document.lineAt(line).text;
    })
    .join("\n");

  return {
    startLine,
    startCharacter,
    endLine,
    endCharacter,
    filePath: relativeFilePath,
    githubRemoteFilePath,
    selectedText,
    memo,
  };
};

const MemoStore = (projectRoot: string, suffix: string) => {
  let map = new Map<MemoJSONContent["filePath"], MemoJSONContent[]>();

  const init = () => {
    const memoFilePaths = readdirSync(projectRoot)
      .filter((file) => file.endsWith(`.${suffix}.json`))
      .flatMap((file) => join(projectRoot, file));

    const memoJSONContents = memoFilePaths.flatMap((filePath) => {
      const file = readFileSync(filePath, "utf-8");
      return JSON.parse(file) as MemoJSONContent[];
    });

    memoJSONContents.forEach((memoJSONContent) => {
      map.set(memoJSONContent.filePath, [
        ...(map.get(memoJSONContent.filePath) ?? []),
        memoJSONContent,
      ]);
    });
  };

  const addMemo = (memoJSONContent: MemoJSONContent) => {
    map.set(memoJSONContent.filePath, [
      ...(map.get(memoJSONContent.filePath) ?? []),
      memoJSONContent,
    ]);
  };

  const getMemoJSONContentsByFile = (filePath: string) => {
    return map.get(filePath) ?? [];
  };

  init();

  return {
    reset: () => {
      map = new Map<MemoJSONContent["filePath"], MemoJSONContent[]>();
      init();
    },
    addMemo,
    getMemoJSONContentsByFile,
  };
};

const MemoReflector = () => {
  const map = new Map<
    MemoJSONContent["filePath"],
    vscode.TextEditorDecorationType[]
  >();

  const reflect = (
    editor: vscode.TextEditor,
    memoJSONContents: MemoJSONContent[]
  ) => {
    // ファイルに適用されているデコレーションを消す (重複しないようにするため)
    memoJSONContents.forEach((memoJSONContent) => {
      map.get(memoJSONContent.filePath)?.forEach((decorationType) => {
        editor.setDecorations(decorationType, []);
        decorationType.dispose();
      });

      map.delete(memoJSONContent.filePath);
    });

    memoJSONContents.forEach((memoJSONContent) => {
      const decorationTypeForText =
        vscode.window.createTextEditorDecorationType({
          after: {
            contentText: `📝 ${
              memoJSONContent.memo.length > 50
                ? `${memoJSONContent.memo.slice(50)}...`
                : memoJSONContent.memo
            }`,
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
