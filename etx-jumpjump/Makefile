DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS
	cp -f src/jumpjump.lua $(DEST)/SCRIPTS/JumpJump.lua
	cp -f src/jumpjump-widget.lua $(DEST)/jumpjump.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
