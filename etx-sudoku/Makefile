DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS
	mkdir -p $(DEST)/IMAGES
	cp -f src/sudoku.lua $(DEST)/SCRIPTS/Sudoku.lua
	cp -f src/sudoku-widget.lua $(DEST)/sudoku.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
