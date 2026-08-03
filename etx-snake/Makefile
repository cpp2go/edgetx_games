DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS/TOOLS
	cp -f src/snake.lua $(DEST)/SCRIPTS/TOOLS/Snake.lua
	mkdir -p $(DEST)/WIDGETS/Snake
	cp -f src/snake-widget.lua $(DEST)/WIDGETS/Snake/main.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
