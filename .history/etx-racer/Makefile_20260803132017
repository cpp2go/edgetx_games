DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS/TOOLS
	cp -f src/racer.lua $(DEST)/SCRIPTS/TOOLS/Racer.lua
	mkdir -p $(DEST)/WIDGETS/Racer
	cp -f src/racer-widget.lua $(DEST)/WIDGETS/Racer/main.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
