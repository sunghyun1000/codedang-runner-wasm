package java.util;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.StringReader;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.charset.Charset;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

/**
 * Project-owned Scanner compatibility implementation for console algorithm code.
 * Compiled once as an SDK definition and mapped to TScanner for TeaVM execution.
 * File/channel constructors and search/stream APIs are intentionally not exposed.
 */
public final class Scanner implements Iterator<String>, Closeable {
    private final Reader reader;
    private final StringBuilder buffer = new StringBuilder();
    private final char[] chunk = new char[1024];
    private int position;
    private boolean eof;
    private boolean closed;
    private IOException ioException;
    // null denotes the default whitespace delimiter; avoid regex engine startup
    // for the overwhelmingly common Scanner(System.in).nextInt() path.
    private Pattern delimiter;
    private Locale locale = Locale.getDefault();
    private int radix = 10;

    public Scanner(InputStream source) { this(new InputStreamReader(Objects.requireNonNull(source))); }
    public Scanner(InputStream source, String charsetName) {
        this(new InputStreamReader(Objects.requireNonNull(source), Charset.forName(charsetName)));
    }
    public Scanner(InputStream source, Charset charset) {
        this(new InputStreamReader(Objects.requireNonNull(source), Objects.requireNonNull(charset)));
    }
    public Scanner(String source) { this(new StringReader(Objects.requireNonNull(source))); }
    public Scanner(Readable source) {
        Objects.requireNonNull(source);
        if (!(source instanceof Reader)) throw new UnsupportedOperationException("Scanner requires a Reader-backed Readable");
        reader = (Reader) source;
        useLocale(locale);
    }
    private void open() { if (closed) throw new IllegalStateException("Scanner closed"); }
    private boolean readMore() {
        if (eof) return false;
        try {
            int count;
            do { count = reader.read(chunk, 0, chunk.length); } while (count == 0);
            if (count < 0) { eof = true; return false; }
            buffer.append(chunk, 0, count);
            return true;
        } catch (IOException error) { ioException = error; eof = true; return false; }
    }
    private void consume(int end) {
        position = end;
        if (position >= 4096) { buffer.delete(0, position); position = 0; }
    }
    // Returns start/end without consuming. Token completion waits for a delimiter
    // or EOF; an empty mailbox is never interpreted as EOF.
    private int[] token() {
        open();
        if (delimiter == null) {
            while (true) {
                int start = position;
                while (start < buffer.length() && Character.isWhitespace(buffer.charAt(start))) start++;
                if (start == buffer.length()) {
                    if (eof) return null;
                    readMore(); continue;
                }
                int end = start;
                while (end < buffer.length() && !Character.isWhitespace(buffer.charAt(end))) end++;
                if (end < buffer.length() || eof) return new int[] { start, end };
                readMore();
            }
        }
        while (true) {
            String text = buffer.toString();
            Matcher skip = delimiter.matcher(text).region(position, text.length());
            int start = position;
            if (skip.lookingAt()) {
                if (skip.hitEnd() && !eof) { readMore(); continue; }
                start = skip.end();
            }
            if (start == text.length()) {
                if (eof) return null;
                readMore(); continue;
            }
            Matcher separator = delimiter.matcher(text);
            int search = start;
            boolean found = separator.find(search);
            // A zero-length delimiter at the start must not create an endless
            // sequence of empty tokens; the next match ends this token.
            if (found && separator.start() == start && separator.end() == start) found = separator.find();
            if (found) {
                if (separator.requireEnd() && !eof) { readMore(); continue; }
                return new int[] { start, separator.start() };
            }
            if (eof) return new int[] { start, text.length() };
            readMore();
        }
    }
    private String peek() {
        int[] range = token();
        return range == null ? null : buffer.substring(range[0], range[1]);
    }
    private String required() {
        String value = peek();
        if (value == null) throw new NoSuchElementException();
        return value;
    }
    public boolean hasNext() {
        open();
        // Unlike next(), hasNext() need not wait for the end of an existing token.
        while (true) {
            if (delimiter == null) {
                int start = position;
                while (start < buffer.length() && Character.isWhitespace(buffer.charAt(start))) start++;
                if (start < buffer.length()) return true;
                if (eof) return false;
                readMore(); continue;
            }
            String text = buffer.toString();
            Matcher skip = delimiter.matcher(text).region(position, text.length());
            int start = skip.lookingAt() ? skip.end() : position;
            if (start < text.length()) return true;
            if (eof) return false;
            readMore();
        }
    }
    public String next() {
        int[] range = token();
        if (range == null) throw new NoSuchElementException();
        String value = buffer.substring(range[0], range[1]);
        consume(range[1]);
        return value;
    }
    public boolean hasNext(String pattern) { return hasNext(Pattern.compile(pattern)); }
    public boolean hasNext(Pattern pattern) { Objects.requireNonNull(pattern); String value = peek(); return value != null && pattern.matcher(value).matches(); }
    public String next(String pattern) { return next(Pattern.compile(pattern)); }
    public String next(Pattern pattern) {
        Objects.requireNonNull(pattern);
        if (!pattern.matcher(required()).matches()) throw new InputMismatchException();
        return next();
    }
    private int[] line() {
        open();
        int scan = position;
        while (true) {
            for (; scan < buffer.length(); scan++) {
                char value = buffer.charAt(scan);
                if (value == '\r') {
                    if (scan + 1 == buffer.length() && !eof) { readMore(); scan--; continue; }
                    int end = scan + 1;
                    if (end < buffer.length() && buffer.charAt(end) == '\n') end++;
                    return new int[] { scan, end };
                }
                if (value == '\n' || value == '\u0085' || value == '\u2028' || value == '\u2029') {
                    return new int[] { scan, scan + 1 };
                }
            }
            if (eof) return position < buffer.length() ? new int[] { buffer.length(), buffer.length() } : null;
            readMore();
        }
    }
    public boolean hasNextLine() { return line() != null; }
    public String nextLine() {
        int[] range = line();
        if (range == null) throw new NoSuchElementException("No line found");
        String value = buffer.substring(position, range[0]);
        consume(range[1]);
        return value;
    }
    private static void checkRadix(int radix) {
        if (radix < Character.MIN_RADIX || radix > Character.MAX_RADIX) throw new IllegalArgumentException("Invalid radix: " + radix);
    }
    private char decimalSeparator() { return locale.getLanguage().equals("de") || locale.getLanguage().equals("fr") ? ',' : '.'; }
    private char groupingSeparator() { return locale.getLanguage().equals("fr") ? '\u202f' : locale.getLanguage().equals("de") ? '.' : ','; }
    private String integer(String value, int radix) {
        checkRadix(radix);
        char group = groupingSeparator();
        String sign = "";
        if (value.startsWith("+") || value.startsWith("-")) { sign = value.substring(0, 1); value = value.substring(1); }
        if (value.isEmpty()) throw new NumberFormatException();
        if (value.indexOf(group) >= 0) {
            int firstGroup = value.indexOf(group);
            if (firstGroup == 0 || firstGroup > 3 || Character.digit(value.charAt(0), radix) <= 0) throw new NumberFormatException();
            StringBuilder digits = new StringBuilder(value.substring(0, firstGroup));
            int from = firstGroup + 1;
            while (true) {
                int to = value.indexOf(group, from);
                if (to < 0) to = value.length();
                if (to - from != 3) throw new NumberFormatException();
                digits.append(value, from, to);
                if (to == value.length()) break;
                from = to + 1;
            }
            value = digits.toString();
        }
        StringBuilder normalized = new StringBuilder(sign);
        for (int i = 0; i < value.length(); i++) {
            int digit = Character.digit(value.charAt(i), radix);
            if (digit < 0) throw new NumberFormatException();
            normalized.append("0123456789abcdefghijklmnopqrstuvwxyz".charAt(digit));
        }
        return normalized.toString();
    }
    private BigInteger integerValue(String value, int radix) { return new BigInteger(integer(value, radix), radix); }
    private long boundedInteger(String value, int radix, long min, long max) {
        long number = Long.parseLong(integer(value, radix), radix);
        if (number < min || number > max) throw new NumberFormatException();
        return number;
    }
    private boolean hasInteger(int radix, long min, long max) {
        checkRadix(radix);
        String value = peek();
        if (value == null) return false;
        try { boundedInteger(value, radix, min, max); return true; } catch (NumberFormatException error) { return false; }
    }
    private long nextInteger(int radix, long min, long max) {
        checkRadix(radix);
        String value = required();
        try { long result = boundedInteger(value, radix, min, max); next(); return result; }
        catch (NumberFormatException error) { throw new InputMismatchException(value); }
    }
    public boolean hasNextByte() { return hasNextByte(radix); }
    public boolean hasNextByte(int radix) { return hasInteger(radix, Byte.MIN_VALUE, Byte.MAX_VALUE); }
    public byte nextByte() { return nextByte(radix); }
    public byte nextByte(int radix) { return (byte) nextInteger(radix, Byte.MIN_VALUE, Byte.MAX_VALUE); }
    public boolean hasNextShort() { return hasNextShort(radix); }
    public boolean hasNextShort(int radix) { return hasInteger(radix, Short.MIN_VALUE, Short.MAX_VALUE); }
    public short nextShort() { return nextShort(radix); }
    public short nextShort(int radix) { return (short) nextInteger(radix, Short.MIN_VALUE, Short.MAX_VALUE); }
    public boolean hasNextInt() { return hasNextInt(radix); }
    public boolean hasNextInt(int radix) { return hasInteger(radix, Integer.MIN_VALUE, Integer.MAX_VALUE); }
    public int nextInt() { return nextInt(radix); }
    public int nextInt(int radix) { return (int) nextInteger(radix, Integer.MIN_VALUE, Integer.MAX_VALUE); }
    public boolean hasNextLong() { return hasNextLong(radix); }
    public boolean hasNextLong(int radix) { return hasInteger(radix, Long.MIN_VALUE, Long.MAX_VALUE); }
    public long nextLong() { return nextLong(radix); }
    public long nextLong(int radix) { return nextInteger(radix, Long.MIN_VALUE, Long.MAX_VALUE); }
    public boolean hasNextBigInteger() { return hasNextBigInteger(radix); }
    public boolean hasNextBigInteger(int radix) {
        checkRadix(radix); String value = peek(); if (value == null) return false;
        try { integerValue(value, radix); return true; } catch (NumberFormatException error) { return false; }
    }
    public BigInteger nextBigInteger() { return nextBigInteger(radix); }
    public BigInteger nextBigInteger(int radix) {
        checkRadix(radix); String value = required();
        try { BigInteger result = integerValue(value, radix); next(); return result; }
        catch (NumberFormatException error) { throw new InputMismatchException(value); }
    }
    private String floating(String value) {
        // Scanner rejects the Float/Double.parseDouble-only type suffixes.
        if (value.endsWith("f") || value.endsWith("F") || value.endsWith("d") || value.endsWith("D")) throw new NumberFormatException();
        char decimal = decimalSeparator();
        char group = groupingSeparator();
        int exponent = Math.max(value.indexOf('e'), value.indexOf('E'));
        String tail = exponent < 0 ? "" : value.substring(exponent);
        String head = exponent < 0 ? value : value.substring(0, exponent);
        int dot = head.indexOf(decimal);
        if (head.indexOf(group) >= 0) {
            String whole = dot < 0 ? head : head.substring(0, dot);
            String fraction = dot < 0 ? "" : head.substring(dot);
            if (fraction.indexOf(group) >= 0) throw new NumberFormatException();
            head = integer(whole, 10) + fraction;
        }
        value = head + tail;
        if (decimal != '.') value = value.replace(decimal, '.');
        StringBuilder ascii = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            int digit = Character.digit(c, 10);
            ascii.append(digit >= 0 ? (char) ('0' + digit) : c);
        }
        return ascii.toString();
    }
    public boolean hasNextDouble() {
        String value = peek(); if (value == null) return false;
        try { Double.parseDouble(floating(value)); return true; } catch (NumberFormatException error) { return false; }
    }
    public double nextDouble() {
        String value = required();
        try { double result = Double.parseDouble(floating(value)); next(); return result; }
        catch (NumberFormatException error) { throw new InputMismatchException(value); }
    }
    public boolean hasNextFloat() {
        String value = peek(); if (value == null) return false;
        try { Float.parseFloat(floating(value)); return true; } catch (NumberFormatException error) { return false; }
    }
    public float nextFloat() {
        String value = required();
        try { float result = Float.parseFloat(floating(value)); next(); return result; }
        catch (NumberFormatException error) { throw new InputMismatchException(value); }
    }
    public boolean hasNextBigDecimal() {
        String value = peek(); if (value == null) return false;
        try { new BigDecimal(floating(value)); return true; } catch (NumberFormatException error) { return false; }
    }
    public BigDecimal nextBigDecimal() {
        String value = required();
        try { BigDecimal result = new BigDecimal(floating(value)); next(); return result; }
        catch (NumberFormatException error) { throw new InputMismatchException(value); }
    }
    public boolean hasNextBoolean() { String value = peek(); return value != null && (value.equalsIgnoreCase("true") || value.equalsIgnoreCase("false")); }
    public boolean nextBoolean() {
        String value = required();
        if (!value.equalsIgnoreCase("true") && !value.equalsIgnoreCase("false")) throw new InputMismatchException(value);
        next(); return Boolean.parseBoolean(value);
    }
    public Scanner useDelimiter(String pattern) { return useDelimiter(Pattern.compile(pattern)); }
    public Scanner useDelimiter(Pattern pattern) { open(); delimiter = Objects.requireNonNull(pattern); return this; }
    public Pattern delimiter() { return delimiter == null ? Pattern.compile("\\p{javaWhitespace}+") : delimiter; }
    public Scanner useRadix(int radix) { open(); checkRadix(radix); this.radix = radix; return this; }
    public int radix() { return radix; }
    public Scanner useLocale(Locale locale) {
        open(); Objects.requireNonNull(locale);
        String language = locale.getLanguage();
        if (locale.getCountry().equals("CH")) throw new UnsupportedOperationException("Unsupported Scanner locale: " + locale);
        if (!language.isEmpty() && !language.equals("en") && !language.equals("de") && !language.equals("fr")
                && !language.equals("ko") && !language.equals("ja") && !language.equals("zh")) {
            throw new UnsupportedOperationException("Unsupported Scanner locale: " + locale);
        }
        this.locale = locale; return this;
    }
    public Locale locale() { return locale; }
    public Scanner reset() { open(); delimiter = null; useLocale(Locale.getDefault()); radix = 10; return this; }
    public IOException ioException() { return ioException; }
    public void remove() { throw new UnsupportedOperationException(); }
    public void close() {
        if (closed) return;
        closed = true;
        try { reader.close(); } catch (IOException error) { ioException = error; }
    }
}
