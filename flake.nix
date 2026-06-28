{
  description = "wordle-tracker-discord-bot: dev shell for inspecting the database";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        # Tools to inspect the bot's SQLite database:
        #   sqlitebrowser  DB Browser for SQLite (GUI application)
        #   litecli        SQLite REPL with autocompletion and highlighting
        #   sqlite         the sqlite3 command-line client
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            sqlitebrowser
            litecli
            sqlite
          ];

          shellHook = ''
            export WORDLE_DB="$PWD/data/wordle.db"
            echo "wordle-tracker db shell"
            echo "  database: $WORDLE_DB"
            echo "  GUI:  sqlitebrowser \"$WORDLE_DB\""
            echo "  REPL: litecli \"$WORDLE_DB\"   (or  sqlite3 \"$WORDLE_DB\")"
            echo "  e.g.  sqlite3 \"$WORDLE_DB\" 'SELECT * FROM results ORDER BY puzzle_number DESC LIMIT 20;'"
          '';
        };
      });
}
