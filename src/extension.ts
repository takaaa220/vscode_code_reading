import * as vscode from "vscode";
import { relative } from "path";
import { MemoContent } from "./memo";
import { MemoReflector } from "./reflector";
import { generateKey, getGithubRemoteFilePath } from "./helper";
import { readMemoTitles, readMemoContentFiles, writeToMemoFiles } from "./io";

export function activate(context: vscode.ExtensionContext) {
  const suffix = "code_memo";

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showInformationMessage("not in a workspace");
    return;
  }

  const projectRoot = workspaceFolders[0].uri.fsPath;

  let currentMemoTitle = "";

  const memoStore = MemoStore(readMemoContentFiles(projectRoot, suffix));
  const memoReflector = MemoReflector(projectRoot, memoStore.getMemos());

  const newMemo = async () => {
    const newOption = "[Create new file]";

    const pickOptions = [newOption, ...readMemoTitles(projectRoot, suffix)];
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

      currentMemoTitle = title;
    } else {
      currentMemoTitle = selected;
    }

    vscode.window.showInformationMessage("Initialized memo!");
  };

  const addMemo = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No found active editor");
      return;
    }

    if (!currentMemoTitle) {
      await newMemo();
    }

    vscode.window.showInputBox({ prompt: "Input memo" }).then((inputText) => {
      if (inputText === undefined) {
        vscode.window.showErrorMessage("Please input memo");
        return;
      }

      const memoContent = toMemoContent({
        memo: inputText,
        document: editor.document,
        selection: editor.selection,
        projectRoot,
      });

      memoStore.addMemo(currentMemoTitle, memoContent);
      memoReflector.refresh(memoStore.getMemos());

      const res = writeToMemoFiles({
        projectRoot,
        suffix,
        memoTitle: currentMemoTitle,
        memoContents: memoStore.getMemosByMemoTitle(currentMemoTitle),
      });

      vscode.window
        .showInformationMessage("Added memo!", "Open memo")
        .then((selection) => {
          if (selection !== "Open memo") {
            return;
          }

          vscode.workspace
            .openTextDocument(res.md)
            .then(vscode.window.showTextDocument);
        });
    });
  };

  const updateMemo = (filePath: string, id: string, memoTitle: string) => {
    if (!filePath || !id || !memoTitle) {
      vscode.window.showErrorMessage("Please select memo");
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No found active editor");
      return;
    }

    const memoContent = memoStore
      .getMemosByFilePath(filePath)
      .find((memo) => memo.id === id);
    if (!memoContent) {
      vscode.window.showErrorMessage("No found memo");
      return;
    }

    vscode.window.showInputBox({ prompt: "Input memo" }).then((inputText) => {
      if (inputText === undefined) {
        vscode.window.showErrorMessage("Please input memo");
        return;
      }

      const updateMemoContent = {
        ...memoContent,
        memo: inputText,
      };

      memoStore.addMemo(currentMemoTitle, updateMemoContent);
      memoReflector.refresh(memoStore.getMemos());

      vscode.window
        .showInformationMessage("Added memo!", "Open memo")
        .then((selection) => {
          if (selection !== "Open memo") {
            return;
          }

          // do something
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
  let disposeUpdateMemo = vscode.commands.registerCommand(
    "extension.updateMemo",
    updateMemo
  );
  const disposeReflector = vscode.workspace.onDidOpenTextDocument(() => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    memoReflector.refresh(memoStore.getMemos());
  });

  context.subscriptions.push(
    disposeNewMemo,
    disposeAddMemo,
    disposeReflector,
    vscode.languages.registerCodeLensProvider("*", memoReflector.provider)
  );
}

export function deactivate() {}

const toMemoContent = ({
  memo,
  document,
  selection,
  projectRoot,
}: {
  memo: string;
  document: vscode.TextDocument;
  selection: vscode.Selection;
  projectRoot: string;
}): MemoContent => {
  const startLine = selection.start.line;
  const startCharacter = selection.start.character;
  const endLine = selection.end.line;
  const endCharacter = selection.end.character;

  const relativeFilePath = relative(projectRoot, document.fileName);

  const githubRemoteFilePath = getGithubRemoteFilePath(
    projectRoot,
    relativeFilePath
  );

  const selectedText = [...Array(endLine - startLine + 1).keys()]
    .map((_, i) => {
      const line = startLine + i;
      return document.lineAt(line).text;
    })
    .join("\n");

  return {
    id: generateKey(),
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

const MemoStore = (
  initialValues: {
    [filePath: MemoContent["filePath"]]: {
      memoTitle: string;
      content: MemoContent;
    }[];
  } = {}
) => {
  let map = new Map<
    MemoContent["filePath"],
    { memoTitle: string; content: MemoContent }[]
  >();

  const toContents = (
    memoTitleAndContents: {
      memoTitle: string;
      content: MemoContent;
    }[]
  ) => memoTitleAndContents.map(({ content }) => content);

  const addMemo = (memoTitle: string, memoContent: MemoContent) => {
    map.set(memoContent.filePath, [
      ...(map.get(memoContent.filePath) ?? []),
      { memoTitle, content: memoContent },
    ]);
  };

  const getMemosByFilePath = (filePath: string) => {
    return toContents(map.get(filePath) ?? []);
  };

  const getMemosByMemoTitle = (memoTitle: string) => {
    return toContents(
      [...map.values()].flat().filter((memo) => memo.memoTitle === memoTitle)
    );
  };

  const getMemos = () => {
    return toContents([...map.values()].flat());
  };

  Object.entries(initialValues).forEach(([filePath, memoTitleAndContents]) => {
    map.set(filePath, memoTitleAndContents);
  });

  return {
    addMemo,
    getMemosByFilePath,
    getMemosByMemoTitle,
    getMemos,
  };
};
