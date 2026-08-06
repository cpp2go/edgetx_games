DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS
	mkdir -p $(DEST)/IMAGES
	cp -f src/mines.lua $(DEST)/SCRIPTS/Mines.lua
	cp -f src/mines-widget.lua $(DEST)/mines.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
