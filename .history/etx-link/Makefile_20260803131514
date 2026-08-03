DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS/TOOLS
	cp -f src/link.lua $(DEST)/SCRIPTS/TOOLS/Link.lua
	mkdir -p $(DEST)/WIDGETS/Link
	cp -f src/link-widget.lua $(DEST)/WIDGETS/Link/main.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
