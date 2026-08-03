DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS/TOOLS
	cp -f src/agar.lua $(DEST)/SCRIPTS/TOOLS/Agar.lua
	mkdir -p $(DEST)/WIDGETS/Agar
	cp -f src/agar-widget.lua $(DEST)/WIDGETS/Agar/main.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
