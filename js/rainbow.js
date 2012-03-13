/**
 * Copyright 2012 Craig Campbell
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Rainbow is a simple code syntax highlighter
 *
 * @preserve @version 1.0
 * @url rainbowco.de
 */
window['Rainbow'] = (function() {

    /**
     * array of replacements to process at the end
     *
     * @type {Object}
     */
    var replacements = {},

        /**
         * an array of start and end positions of blocks to be replaced
         *
         * @type {Object}
         */
        replacement_positions = {},

        /**
         * an array of the language patterns specified for each language
         *
         * @type {Object}
         */
        language_patterns = {},

        /**
         * an array of languages and whether they should bypass the default patterns
         *
         * @type {Object}
         */
        bypass_defaults = {},

        /**
         * processing level
         *
         * replacements are stored at this level so if there is a sub block of code
         * (for example php inside of html) it runs at a different level
         *
         * @type {number}
         */
        CURRENT_LEVEL = 0,

        /**
         * constant used to refer to the default language
         *
         * @type {number}
         */
        DEFAULT_LANGUAGE = 0,

        /**
         * used as counters so we can selectively call setTimeout
         * after processing a certain number of matches/replacements
         *
         * @type {number}
         */
        match_counter = 0,

        /**
         * @type {number}
         */
        replacement_counter = 0;

    /**
     * cross browser get attribute for an element
     *
     * @see http://stackoverflow.com/questions/3755227/cross-browser-javascript-getattribute-method
     *
     * @param {Element} el
     * @param {string} attr     attribute you are trying to get
     * @returns {string}
     */
    function _attr(el, attr) {
        var result = (el.getAttribute && el.getAttribute(attr)) || null;

        if (!result) {
            var attrs = el.attributes,
                length = attrs.length,
                i;

            for (i = 0; i < length; ++i) {
                if (attr[i].nodeName === attr) {
                    result = attr[i].nodeValue;
                }
            }
        }

        return result;
    }

    /**
     * determines if a new match intersects with an existing one
     *
     * @param {number} start1    start position of existing match
     * @param {number} end1      end position of existing match
     * @param {number} start2    start position of new match
     * @param {number} end2      end position of new match
     * @returns {boolean}
     */
    function _intersects(start1, end1, start2, end2) {
        if (start2 >= start1 && start2 < end1) {
            return true;
        }

        return end2 > start1 && end2 < end1;
    }

    /**
     * determines if two different matches have complete overlap with each other
     *
     * @param {number} start1   start position of existing match
     * @param {number} end1     end position of existing match
     * @param {number} start2   start position of new match
     * @param {number} end2     end position of new match
     * @returns {boolean}
     */
    function _hasCompleteOverlap(start1, end1, start2, end2) {
        if (start2 == start1 && end2 == end1) {
            return false;
        }

        return start2 <= start1 && end2 >= end1;
    }

    /**
     * determines if the match passed in falls inside of an existing match
     * this prevents a regex pattern from matching inside of a bigger pattern
     *
     * @param {number} start - start position of new match
     * @param {number} end - end position of new match
     * @returns {boolean}
     */
    function _matchIsInsideOtherMatch(start, end) {
        for (var key in replacement_positions[CURRENT_LEVEL]) {
            key = parseInt(key, 10);

            // if this block completely overlaps with another block
            // then we should remove the other block and return false
            if (_hasCompleteOverlap(key, replacement_positions[CURRENT_LEVEL][key], start, end)) {
                delete replacement_positions[CURRENT_LEVEL][key];
                delete replacements[CURRENT_LEVEL][key];
            }

            if (_intersects(key, replacement_positions[CURRENT_LEVEL][key], start, end)) {
                return true;
            }
        }

        return false;
    }

    /**
     * takes a string of code and wraps it in a span tag based on the name
     *
     * @param {string} name     name of the pattern (ie keyword.regex)
     * @param {string} code     block of code to wrap
     * @returns {string}
     */
    function _wrapCodeInSpan(name, code) {
        return '<span class="' + name.replace(/\./g, ' ') + '">' + code + '</span>';
    }

    /**
     * finds out the position of group match for a regular expression
     *
     * @see http://stackoverflow.com/questions/1985594/how-to-find-index-of-groups-in-match
     *
     * @param {Object} match
     * @param {number} group_number
     * @returns {number}
     */
    function _indexOfGroup(match, group_number) {
        var index = match.index,
            i;

        for (i = 1; i < group_number; ++i) {
            if (match[i]) {
                index += match[i].length;
            }
        }

        return index;
    }

    /**
     * matches a regex pattern against a block of code
     * finds all matches that should be processed and stores the positions
     * of where they should be replaced within the string
     *
     * this is where pretty much all the work is done but it should not
     * be called directly
     *
     * @param {RegExp} pattern
     * @param {string} code
     * @returns void
     */
    function _processPattern(regex, pattern, code, callback)
    {
        var match = regex.exec(code);

        if (!match) {
            return callback();
        }

        ++match_counter;

        var replacement = match[0],
            start_pos = match.index,
            end_pos = match[0].length + start_pos;

        /**
         * callback to process the next match of this pattern
         */
        var processNext = function() {
            var nextCall = function() {
                _processPattern(regex, pattern, code, callback);
            };

            // every 100 items we process let's call set timeout
            // to let the ui breathe a little
            return match_counter % 100 > 0 ? nextCall() : setTimeout(nextCall, 0);
        };

        // if this is not a child match and it falls inside of another
        // match that already happened we should skip it and continue processing
        if (_matchIsInsideOtherMatch(start_pos, end_pos)) {
            return processNext();
        }

        /**
         * callback for when a match was successfully processed
         */
        var onMatchSuccess = function(replacement) {
            // if this match has a name then wrap it in a span tag
            if (pattern['name']) {
                replacement = _wrapCodeInSpan(pattern['name'], replacement);
            }

            // console.log('LEVEL', CURRENT_LEVEL, 'replace', match[0], 'with', replacement, 'at position', start_pos, 'to', end_pos);

            // store what needs to be replaced with what at this position
            if (!replacements[CURRENT_LEVEL]) {
                replacements[CURRENT_LEVEL] = {};
                replacement_positions[CURRENT_LEVEL] = {};
            }

            replacements[CURRENT_LEVEL][start_pos] = {
                'replace': match[0],
                'with': replacement
            };

            // store the range of this match so we can use it for comparisons
            // with other matches later
            replacement_positions[CURRENT_LEVEL][start_pos] = end_pos;

            // process the next match
            processNext();
        };

        // if this pattern has sub matches for different groups in the regex
        // then we should process them one at a time by rerunning them through
        // this function to generate the new replacement
        var group_keys = keys(pattern['matches']);

        /**
         * callback for processing a sub group
         */
        var processGroup = function(i, group_keys, callback) {
            if (i >= group_keys.length) {
                return callback(replacement);
            }

            var processNextGroup = function() {
                processGroup(++i, group_keys, callback);
            },
                block = match[group_keys[i]];

            // if there is no match here then move on
            if (!block) {
                return processNextGroup();
            }

            var group = pattern['matches'][group_keys[i]],
                language = group['language'];

            // if this is a sublanguage go and process the block using that language
            if (language) {
                return _highlightBlockForLanguage(block, language, function(code) {
                    replacement = replacement.replace(block, code);
                    processNextGroup();
                });
            }

            // @todo add support for passing an array of patterns to match a subgroup against
            // if this is a submatch go and process the block using the specified pattern
            if (group['name']) {
                return _processCodeWithPatterns(block, [group], function(code) {
                    replacement = replacement.replace(block, code);
                    processNextGroup();
                });
            }

            var group_match_position = _indexOfGroup(match, group_keys[i]) - match.index;
            replacement = _replaceAtPosition(group_match_position, block, _wrapCodeInSpan(group, block), replacement);
            processNextGroup();
        };

        processGroup(0, group_keys, onMatchSuccess);
    }

    /**
     * should a language bypass the default patterns?
     *
     * if you call Rainbow.extend() and pass true as the third argument
     * it will bypass the defaults
     */
    function _bypassDefaultPatterns(language)
    {
        return bypass_defaults[language] == 1;
    }

    /**
     * returns a list of regex patterns for this language
     *
     * @param {string} language
     * @returns {Array}
     */
    function _getPatternsForLanguage(language) {
        var patterns = language_patterns[language] || [],
            default_patterns = language_patterns[DEFAULT_LANGUAGE];

        if (_bypassDefaultPatterns(language)) {
            return patterns;
        }

        return patterns.concat(default_patterns);
    }

    /**
     * substring replace call to replace part of a string at a certain position
     *
     * @param {number} position         the position where the replacement should happen
     * @param {string} replace          the text we want to replace
     * @param {string} replace_with     the text we want to replace it with
     * @param {string} code             the code we are doing the replacing in
     * @returns {string}
     */
    function _replaceAtPosition(position, replace, replace_with, code) {
        var sub_string = code.substr(position);
        return code.substr(0, position) + sub_string.replace(replace, replace_with);
    }

   /**
     * sorts an object by index descending
     *
     * @param {Object} object
     * @return {Array}
     */
    function keys(object) {
        var locations = [],
            replacement,
            pos;

        for(var location in object) {
            if (object.hasOwnProperty(location)) {
                locations.push(location);
            }
        }

        // numeric descending
        return locations.sort(function(a, b) {
            return b - a;
        });
    }

    /**
     * processes a block of code using specified patterns
     *
     * @param {string} code
     * @param {Array} patterns
     * @returns void
     */
    function _processCodeWithPatterns(code, patterns, callback)
    {
        // we have to increase the level here so that the
        // replacements will not conflict with each other when
        // processing sub blocks of code
        ++CURRENT_LEVEL;

        // patterns are processed one at a time through this function
        function _workOnPatterns(patterns, i)
        {
            // still have patterns to process, keep going
            if (i < patterns.length) {
                return _processPattern(patterns[i]['pattern'], patterns[i], code, function() {
                    _workOnPatterns(patterns, ++i);
                });
            }

            // we are done processing the patterns
            // process the replacements and update the DOM
            _processReplacements(code, function(code) {

                // when we are done processing replacements
                // we are done at this level so we can go back down
                delete replacements[CURRENT_LEVEL];
                delete replacement_positions[CURRENT_LEVEL];
                --CURRENT_LEVEL;
                callback(code);
            });
        }

        _workOnPatterns(patterns, 0);
    }

    /**
     * process replacements in the string of code to actually update the markup
     *
     * @param {string} code         the code to process replacements in
     * @param {Function} onComplete   what to do when we are done processing
     * @returns void
     */
    function _processReplacements(code, onComplete) {

        /**
         * processes a single replacement
         *
         * @param {string} code
         * @param {Array} positions
         * @param {number} i
         * @param {Function} onComplete
         * @returns void
         */
        function _processReplacement(code, positions, i, onComplete) {
            if (i < positions.length) {
                ++replacement_counter;
                pos = positions[i];
                replacement = replacements[CURRENT_LEVEL][pos];
                code = _replaceAtPosition(pos, replacement['replace'], replacement['with'], code);

                // process next function
                var next = function() {
                    _processReplacement(code, positions, ++i, onComplete);
                };

                // use a timeout every 250 to not freeze up the UI
                return replacement_counter % 250 > 0 ? next() : setTimeout(next, 0);
            }

            onComplete(code);
        }

        var string_positions = keys(replacements[CURRENT_LEVEL]);
        _processReplacement(code, string_positions, 0, onComplete);
    }

    /**
     * takes a string of code and highlights it according to the language specified
     *
     * @param {string} code
     * @param {string} language
     * @param {Function} onComplete
     * @returns void
     */
    function _highlightBlockForLanguage(code, language, onComplete) {
        var patterns = _getPatternsForLanguage(language);
        _processCodeWithPatterns(code, patterns, function (code) {
            onComplete(code);
        });
    }

    /**
     * highlight an individual code block
     *
     * @param {NodeList} code_blocks
     * @param {number} i
     * @returns void
     */
    function _highlightCodeBlock(code_blocks, i) {
        if (i < code_blocks.length) {
            var language = _attr(code_blocks[i], 'data-language');

            if (language) {
                language = language.toLowerCase();

                code_blocks[i].className = language;

                _highlightBlockForLanguage(code_blocks[i].innerHTML, language, function (code) {
                    code_blocks[i].innerHTML = code;

                    // reset the replacement arrays
                    replacements = {};
                    replacement_positions = {};

                    // process the next block
                    setTimeout(function() {
                        _highlightCodeBlock(code_blocks, ++i);
                    }, 0);
                });
            }
        }
    }

    /**
     * start highlighting all the code blocks
     *
     * @returns void
     */
    function _highlight() {
        var code_blocks = document.getElementsByTagName('code');
        _highlightCodeBlock(code_blocks, 0);
    }

    /**
     * public methods
     */
    return {

        /**
         * extends the language pattern matches
         *
         * @param {*} language     name of language
         * @param {*} patterns      array of patterns to add on
         * @param {boolean|null} bypass      if true this will bypass the default language patterns
         */
        extend: function(language, patterns, bypass) {

            // if there is only one argument then we assume that we want to
            // extend the default language rules
            if (arguments.length == 1) {
                patterns = language;
                language = DEFAULT_LANGUAGE;
            }

            bypass_defaults[language] = bypass;
            language_patterns[language] = patterns.concat(language_patterns[language] || []);
        },

        /**
         * starts the magic rainbow
         *
         * @returns void
         */
        init: function() {
            _highlight();
        }
    };
}) ();


/**
 * adds event listener to start highlighting
 */
(function (w) {
    if (w.addEventListener) {
        return w.addEventListener('load', Rainbow.init, false);
    }
    w.attachEvent('onload', Rainbow.init);
}) (window);


/**
 * adds the default language patterns
 */
Rainbow.extend([
    {
        'name': 'comment',
        'pattern': /\/\*[\s\S]*?\*\/|\/\/[\s\S]*?$|\#[\s\S]*?$/gm
    },
    {
        'matches': {
            2: 'string'
        },
        'pattern': /(\(|\s|\[)(('|")[\s\S]*?(\3))/gm
    },
    {
        'name': 'integer',
        'pattern': /\b(0x[\da-f]+|\d+)\b/g
    },
    {
        'name': 'constant',
        'pattern': /\b[A-Z0-9_]{2,}\b/g
    },
    {
        'matches': {
            1: 'keyword'
        },
        'pattern': /\b(and|array|as|bool(ean)?|catch|char|class|const|def|delete|die|do(uble)?|echo|else(if)?|exit|extends|finally|float|for(each)?|function|global|if|import|int(eger)?|long|new|object|or|pr(int|ivate|otected)|pub(lic|lished)|re(al|source|turn)|self|short|st(ring|ruct|atic)|switch|th(en|is|row)|try|(un)?signed|var|void|while|xor)(?=\(|\b)/g
    },
    {
        'name': 'constant.language',
        'pattern': /true|false|null/g
    },
    {
        'name': 'keyword.operator',
        'pattern': /\+|\!|\-|&gt;|&lt;|&amp;|\||\*|\=/g
    },
    {
        'matches': {
            1: 'function.call'
        },
        'pattern': /(\w+?)(?=\()/g
    },
    {
        'matches': {
            1: 'keyword',
            2: 'meta.function-call'
        },
        'pattern': /(function)\s(.*?)(?=\()/g
    }
]);
