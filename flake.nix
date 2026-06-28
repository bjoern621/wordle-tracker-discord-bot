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
        # Dev shell:
        #   nodejs_22    Node.js runtime for the TypeScript build (tsc, tsx)
        #   go-task      the `task` runner (see Taskfile.yml)
        #   dbeaver-bin  database GUI application
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            go-task
            dbeaver-bin
          ];

          shellHook = ''
            export PGPORT="''${POSTGRES_PORT:-5432}"
            export PGPASSWORD="''${POSTGRES_PASSWORD:-wordle}"
            export DATABASE_URL="''${DATABASE_URL:-postgresql://wordle:$PGPASSWORD@localhost:$PGPORT/wordle}"
            echo "wordle-tracker dev shell (PostgreSQL on localhost:$PGPORT)"
            echo "  task --list           show all commands"
            echo "  task up               start db, migrate, bot"
            echo "  DATABASE_URL          connect DBeaver to this"
          '';
        };
      });
}
