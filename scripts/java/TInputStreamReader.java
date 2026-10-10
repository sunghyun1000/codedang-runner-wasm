package org.teavm.classlib.java.io;

import java.io.IOException;
import org.teavm.classlib.java.nio.charset.TCharset;
import org.teavm.classlib.java.nio.charset.TCharsetDecoder;

/** Runner compatibility reader avoiding the self-hosted compiler's NIO/JSByRef path. */
public class TInputStreamReader extends TReader {
    private final TInputStream input;
    private final String encoding;
    private boolean closed;
    private int pending = -1;
    private int pushedByte = -1;

    public TInputStreamReader(TInputStream input) { this(input, "UTF-8", true); }
    public TInputStreamReader(TInputStream input, String encoding) throws TUnsupportedEncodingException {
        this(input, encoding, true);
        if (!supported(encoding)) throw new TUnsupportedEncodingException(encoding);
    }
    public TInputStreamReader(TInputStream input, TCharset charset) { this(input, charset.name(), true); }
    public TInputStreamReader(TInputStream input, TCharsetDecoder decoder) { this(input, decoder.charset().name(), true); }
    private TInputStreamReader(TInputStream input, String encoding, boolean ignored) {
        if (input == null || encoding == null) throw new NullPointerException();
        if (!supported(encoding)) throw new IllegalArgumentException("Unsupported runner encoding: " + encoding);
        this.input = input;
        this.encoding = encoding.toUpperCase(java.util.Locale.ROOT).replace("_", "-");
    }
    private static boolean supported(String name) {
        String normalized = name.toUpperCase(java.util.Locale.ROOT).replace("_", "-");
        return normalized.equals("UTF-8") || normalized.equals("UTF8") || normalized.equals("US-ASCII")
                || normalized.equals("ASCII") || normalized.equals("ISO-8859-1") || normalized.equals("ISO8859-1");
    }
    public String getEncoding() { return closed ? null : encoding; }
    public void close() throws IOException { if (!closed) { closed = true; input.close(); } }
    private int nextByte() throws IOException {
        if (pushedByte >= 0) { int value = pushedByte; pushedByte = -1; return value; }
        return input.read();
    }
    public int read() throws IOException {
        if (closed) throw new IOException("Stream closed");
        if (pending >= 0) { int value = pending; pending = -1; return value; }
        int first = nextByte();
        if (first < 0) return -1;
        if (encoding.startsWith("ISO")) return first;
        if (encoding.equals("ASCII") || encoding.equals("US-ASCII")) return first < 128 ? first : 0xfffd;
        if (first < 128) return first;
        int length = first >= 0xc2 && first <= 0xdf ? 2 : first >= 0xe0 && first <= 0xef ? 3
                : first >= 0xf0 && first <= 0xf4 ? 4 : 0;
        if (length == 0) return 0xfffd;
        int code = first & (0x7f >> length);
        for (int i = 1; i < length; i++) {
            int value = nextByte();
            if (value < 0) return 0xfffd;
            if ((value & 0xc0) != 0x80) { pushedByte = value; return 0xfffd; }
            code = (code << 6) | (value & 63);
        }
        if (code < (length == 2 ? 128 : length == 3 ? 2048 : 65536)
                || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) return 0xfffd;
        if (code <= 65535) return code;
        code -= 65536;
        pending = 0xdc00 | (code & 1023);
        return 0xd800 | (code >> 10);
    }
    public int read(char[] chars, int offset, int length) throws IOException {
        if (chars == null) throw new NullPointerException();
        if (offset < 0 || length < 0 || length > chars.length - offset) throw new IndexOutOfBoundsException();
        if (closed) throw new IOException("Stream closed");
        if (length == 0) return 0;
        int value = read();
        if (value < 0) return -1;
        chars[offset] = (char) value;
        int count = 1;
        while (count < length && ready()) {
            value = read();
            if (value < 0) break;
            chars[offset + count++] = (char) value;
        }
        return count;
    }
    public boolean ready() throws IOException {
        if (closed) throw new IOException("Stream closed");
        return pending >= 0 || pushedByte >= 0 || input.available() > 0;
    }
}
