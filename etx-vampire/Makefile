DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS
	mkdir -p $(DEST)/IMAGES
	cp -f src/vampire.lua $(DEST)/SCRIPTS/Vampire.lua
	cp -f src/vampire-widget.lua $(DEST)/vampire.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
