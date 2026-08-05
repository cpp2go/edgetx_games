DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS
	mkdir -p $(DEST)/IMAGES
	cp -f src/match3.lua $(DEST)/SCRIPTS/Match3.lua
	cp -f src/match3-widget.lua $(DEST)/match3.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
