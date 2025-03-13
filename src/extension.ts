// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { count, IWordCountResult } from "@homegrown/word-counter";
import getMarkdownContent from "./markdown";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "markdown-word-count" is now active!'
  );

  const updater = new WordCountUIUpdater();
  context.subscriptions.push(updater);
  updater.update();
}

type WordCountResultKeys = keyof IWordCountResult;
class WordCountUIUpdater {
  private counts = [
    "words" as const,
    "lines" as const,
    "characters" as const,
    "charactersWithSpaces" as const,
  ];
  private statusBarShownCounts: (typeof this.counts)[number][] = [];
  private enableSelectionCount: boolean = false;
  private statusBarItem;
  private disposable: vscode.Disposable[] = [];

  constructor() {
    this.setConfiguration();
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );

    vscode.window.onDidChangeTextEditorSelection(
      this.update,
      this,
      this.disposable
    );
    vscode.window.onDidChangeActiveTextEditor(
      this.update,
      this,
      this.disposable
    );
    vscode.workspace.onDidChangeConfiguration(
      this.onConfigurationChange,
      this,
      this.disposable
    );
  }
  onConfigurationChange(e: vscode.ConfigurationChangeEvent) {
    if (
      e.affectsConfiguration("markdown-word-count.statusBarCounts") ||
      e.affectsConfiguration("markdown-word-count.selectionCount")
    ) {
      this.setConfiguration();
      this.update();
    }
  }
  setConfiguration() {
    const configuration = vscode.workspace.getConfiguration(
      "markdown-word-count"
    );
    const shownItemsConfig = configuration.get<{ [_: string]: boolean }>(
      "statusBarCounts"
    );
    this.statusBarShownCounts = shownItemsConfig
      ? this.counts.filter((count) => shownItemsConfig[count])
      : ["words"];
    this.enableSelectionCount =
      configuration.get<boolean>("selectionCount") ?? false;
  }
  update() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.statusBarItem.hide();
      return;
    }
    
    const isMarkdown = editor.document.languageId === "markdown";
    const isPlaintext = editor.document.languageId === "plaintext";
    const isQuarto = editor.document.languageId === "quarto";
    
    if (!isMarkdown && !isPlaintext && !isQuarto) {
      this.statusBarItem.hide();
      return;
    }

    try {
      const docContent = editor.document.getText();
      const {
        content: markdownContent,
        frontMatterEndLine,
      } = getMarkdownContent(docContent);
      // Process QMD files like markdown files
      const isMarkdownLike = isMarkdown || isQuarto;
      const mainContent = isMarkdownLike ? markdownContent : docContent;
      const selectionCount: IWordCountResult = {
        words: 0,
        lines: 0,
        characters: 0,
        charactersWithSpaces: 0,
      };
      const selectionContent = editor.selections
        .map(({ start, end }) => {
          if (end.line <= frontMatterEndLine) {
            return "";
          }
          if (start.line <= frontMatterEndLine) {
            start = new vscode.Position(frontMatterEndLine + 1, 0);
          }
          const text = editor.document.getText(new vscode.Range(start, end));
          return text;
        })
        .filter((text) => !!text);
      const showSelectionCount =
        this.enableSelectionCount && selectionContent.length > 0;
      if (showSelectionCount) {
        selectionContent.forEach((text) => {
          const countResult = count(text);
          Object.keys(selectionCount).forEach((key) => {
            selectionCount[key as WordCountResultKeys] +=
              countResult[key as WordCountResultKeys] ?? 0;
          });
        });
      }

      const fullTextCount = count(mainContent);
      const SEPARATION = "/";

      const countText = {
        words: `${
          (showSelectionCount ? selectionCount.words + SEPARATION : "") +
          fullTextCount.words
        } Words`,
        lines: `${
          (showSelectionCount ? selectionCount.lines + SEPARATION : "") +
          fullTextCount.lines
        } Lines`,
        characters: `${
          (showSelectionCount ? selectionCount.characters + SEPARATION : "") +
          fullTextCount.characters
        } Characters`,
        charactersWithSpaces: `${
          (showSelectionCount
            ? selectionCount.charactersWithSpaces + SEPARATION
            : "") + fullTextCount.charactersWithSpaces
        } Characters with spaces`,
      };

      this.statusBarItem.text = `$(markdown) ${this.statusBarShownCounts
        .map((id) => countText[id] ?? "")
        .join(" | ")}`;
      this.statusBarItem.tooltip = Object.values(countText)
        .map((text) => text.replace(SEPARATION, ` ${SEPARATION} `))
        .join("\n");
      this.statusBarItem.show();
    } catch (e) {
      console.log(e);
    }
  }
  dispose() {
    this.statusBarItem.dispose();
    vscode.Disposable.from(...this.disposable).dispose();
  }
}
